import {randomUUID} from 'node:crypto';
import {mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import type {Pool} from 'pg';
import {connection,currentAccess,transaction} from './postgres';
import {extractMaterial} from './material-extraction';
const columns='id,filename,format,byte_size,created_by,created_at';
export class ProjectMaterials{
 constructor(private readonly pool:Pool){}
 private path(projectId:string,name:string){return join(resolve(process.env.PATENT_DATA_DIR||'data'),'materials',projectId,name);}
 async create(file:File,signal?:AbortSignal){
  const scope=currentAccess();if(!scope)throw new Error('保存材料需要项目身份');
  const extraction=await extractMaterial(file,signal),id=randomUUID(),storageName=id+'.'+extraction.format;
  const path=this.path(scope.projectId,storageName);await mkdir(resolve(path,'..'),{recursive:true});
  await writeFile(path,Buffer.from(await file.arrayBuffer()),{flag:'wx',mode:0o600});
  try{
   const row=(await connection(this.pool).query(`INSERT INTO project_materials(id,organization_id,project_id,filename,format,byte_size,storage_name,extraction,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${columns}`,[id,scope.organizationId,scope.projectId,file.name,extraction.format,file.size,storageName,JSON.stringify({...extraction,saved:true}),scope.userId])).rows[0];
   return {...row,extraction:{...extraction,saved:true}};
  }catch(error){await rm(path,{force:true});throw error;}
 }
 async list(offset=0){return (await connection(this.pool).query(`SELECT ${columns} FROM project_materials WHERE removed_at IS NULL ORDER BY created_at DESC,id LIMIT 50 OFFSET $1`,[offset])).rows;}
 async read(id:string){const row=(await connection(this.pool).query(`SELECT ${columns},extraction FROM project_materials WHERE id=$1 AND removed_at IS NULL`,[id])).rows[0];if(!row)throw new Error('材料不存在或无访问权限');return row;}
 async original(id:string){
  const row=(await connection(this.pool).query(`SELECT ${columns},project_id,storage_name FROM project_materials WHERE id=$1 AND removed_at IS NULL`,[id])).rows[0];if(!row)throw new Error('材料不存在或无访问权限');
  return {filename:row.filename,format:row.format,bytes:await readFile(this.path(row.project_id,row.storage_name))};
 }
 async remove(id:string){return transaction(this.pool,async client=>{
  const row=await client.query('UPDATE project_materials SET removed_at=now() WHERE id=$1 AND removed_at IS NULL RETURNING id',[id]);if(!row.rowCount)throw new Error('材料不存在或无修改权限');
  await client.query("UPDATE jobs SET cancel_requested=true,state=CASE WHEN state='queued' THEN 'cancelled' ELSE state END,updated_at=now() WHERE material_id=$1 AND kind='material-ocr' AND state IN('queued','running')",[id]);
  return {ok:true,retainedOriginal:true};
 });}
 async restore(id:string){const row=await connection(this.pool).query('UPDATE project_materials SET removed_at=NULL WHERE id=$1 AND removed_at IS NOT NULL RETURNING id',[id]);if(!row.rowCount)throw new Error('材料未移除或无修改权限');return {ok:true};}
}
