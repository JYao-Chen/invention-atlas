import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Pool} from 'pg';
import {connection,currentAccess,transaction} from './postgres';
const labelInput=z.object({name:z.string().trim().min(1).max(100),parentId:z.string().min(1).optional()});
const annotationInput=z.object({datasetId:z.string().min(1),patentId:z.string().min(1),labelId:z.string().min(1).optional(),body:z.string().trim().max(20000).default(''),origin:z.enum(['manual','ai-suggestion']).default('manual')}).refine(data=>data.labelId||data.body,{message:'请选择标签或填写笔记'});
export class ProjectAnnotations{
 constructor(private readonly pool:Pool){}
 private scope(){const scope=currentAccess();if(!scope)throw new Error('标引需要项目身份');return scope;}
 async labels(){const scope=this.scope();return (await connection(this.pool).query('SELECT * FROM project_labels WHERE project_id=$1 ORDER BY created_at,id',[scope.projectId])).rows;}
 async createLabel(input:unknown){const data=labelInput.parse(input),scope=this.scope();return (await connection(this.pool).query('INSERT INTO project_labels(id,organization_id,project_id,name,parent_id,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[randomUUID(),scope.organizationId,scope.projectId,data.name,data.parentId||null,scope.userId])).rows[0];}
 async renameLabel(id:string,input:unknown){const {name}=labelInput.pick({name:true}).parse(input),scope=this.scope();const result=await connection(this.pool).query('UPDATE project_labels SET name=$1 WHERE id=$2 AND project_id=$3 RETURNING *',[name,id,scope.projectId]);if(!result.rowCount)throw new Error('项目标签不存在');return result.rows[0];}
 async deleteLabel(id:string){const scope=this.scope();try{const result=await connection(this.pool).query('DELETE FROM project_labels WHERE id=$1 AND project_id=$2',[id,scope.projectId]);if(!result.rowCount)throw new Error('项目标签不存在');}catch(error){if((error as {code?:string}).code==='23503')throw Object.assign(new Error('标签仍有子标签或标引笔记引用，请先处理关联后再删除。'),{code:'23503'});throw error;}}
 async list(datasetId:string,patentId:string){const scope=this.scope();return (await connection(this.pool).query('SELECT a.*,l.name AS label_name FROM patent_annotations a LEFT JOIN project_labels l ON l.id=a.label_id WHERE a.project_id=$1 AND a.dataset_id=$2 AND a.patent_id=$3 ORDER BY a.created_at,a.id',[scope.projectId,datasetId,patentId])).rows;}
 async create(input:unknown){const data=annotationInput.parse(input),scope=this.scope(),db=connection(this.pool);if(!(await db.query('SELECT 1 FROM patents WHERE dataset_id=$1 AND id=$2',[data.datasetId,data.patentId])).rowCount)throw new Error('专利不在可访问的数据集中');return (await db.query('INSERT INTO patent_annotations(id,organization_id,project_id,dataset_id,patent_id,label_id,body,origin,status,created_by,confirmed_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',[randomUUID(),scope.organizationId,scope.projectId,data.datasetId,data.patentId,data.labelId||null,data.body,data.origin,data.origin==='manual'?'confirmed':'proposed',scope.userId,data.origin==='manual'?scope.userId:null])).rows[0];}
 async update(id:string,input:unknown){const {body}=z.object({body:z.string().trim().max(20000)}).parse(input),scope=this.scope();const result=await connection(this.pool).query("UPDATE patent_annotations SET body=$1,origin='manual',status='confirmed',confirmed_by=$2,updated_at=now() WHERE id=$3 AND project_id=$4 RETURNING *",[body,scope.userId,id,scope.projectId]);if(!result.rowCount)throw new Error('笔记不存在');return result.rows[0];}
 async confirm(id:string){const scope=this.scope();const result=await connection(this.pool).query("UPDATE patent_annotations SET status='confirmed',confirmed_by=$1,updated_at=now() WHERE id=$2 AND project_id=$3 RETURNING *",[scope.userId,id,scope.projectId]);if(!result.rowCount)throw new Error('笔记不存在');return result.rows[0];}
 async remove(id:string){const scope=this.scope();const result=await connection(this.pool).query('DELETE FROM patent_annotations WHERE id=$1 AND project_id=$2',[id,scope.projectId]);if(!result.rowCount)throw new Error('笔记不存在');}
 async applyLabel(input:unknown){
  const data=z.object({datasetId:z.string().min(1),patentIds:z.array(z.string().trim().min(1)).min(1).max(500),labelId:z.string().min(1),mode:z.enum(['attach','detach'])}).parse(input),scope=this.scope(),ids=[...new Set(data.patentIds)];
  return transaction(this.pool,async db=>{
   if(!(await db.query('SELECT 1 FROM project_labels WHERE id=$1 AND project_id=$2',[data.labelId,scope.projectId])).rowCount)throw new Error('项目标签不存在');
   if((await db.query('SELECT id FROM patents WHERE dataset_id=$1 AND id=ANY($2::text[])',[data.datasetId,ids])).rowCount!==ids.length)throw new Error('部分专利不在可访问的数据集中，未执行批量标引');
   let changed=0;
   if(data.mode==='attach'){const selected=ids.map(patent_id=>({id:randomUUID(),patent_id}));const result=await db.query("INSERT INTO patent_annotations(id,organization_id,project_id,dataset_id,patent_id,label_id,origin,status,created_by,confirmed_by) SELECT selected.id,$2,$3,$4,selected.patent_id,$5,'manual','confirmed',$6,$6 FROM jsonb_to_recordset($1::jsonb) AS selected(id text,patent_id text) WHERE NOT EXISTS(SELECT 1 FROM patent_annotations WHERE project_id=$3 AND dataset_id=$4 AND patent_id=selected.patent_id AND label_id=$5 AND status='confirmed') RETURNING id",[JSON.stringify(selected),scope.organizationId,scope.projectId,data.datasetId,data.labelId,scope.userId]);changed=result.rowCount||0;}
   else{
    const deleted=await db.query("DELETE FROM patent_annotations WHERE project_id=$1 AND dataset_id=$2 AND patent_id=ANY($3::text[]) AND label_id=$4 AND body=''",[scope.projectId,data.datasetId,ids,data.labelId]);
    const retained=await db.query("UPDATE patent_annotations SET label_id=NULL,updated_at=now() WHERE project_id=$1 AND dataset_id=$2 AND patent_id=ANY($3::text[]) AND label_id=$4 AND body<>''",[scope.projectId,data.datasetId,ids,data.labelId]);changed=(deleted.rowCount||0)+(retained.rowCount||0);
   }
   return {mode:data.mode,selected:ids.length,changed};
  });
 }
}
