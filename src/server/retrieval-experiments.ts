import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Pool} from 'pg';
import {connection,currentAccess,transaction} from './postgres';

const patentNumbers=z.array(z.string().trim().min(1).max(100)).max(100000);
export const retrievalExperimentSchema=z.object({datasetId:z.string().min(1),method:z.enum(['ai','manual_boolean']),query:z.string().trim().min(1).max(20000),startedAt:z.string().datetime({offset:true}),endedAt:z.string().datetime({offset:true}),patentNumbers}).strict().refine(v=>Date.parse(v.endedAt)>=Date.parse(v.startedAt),{message:'结束时间不能早于开始时间',path:['endedAt']});
export const referenceSetSchema=z.object({referencePatentNumbers:patentNumbers}).strict();
// Denominators use unique publication numbers, not a judged subset of the hits.
export function retrievalMetrics(hits:string[],reference:string[]){
 const normalize=(ids:string[])=>new Set(ids.map(id=>id.toUpperCase().replace(/[^A-Z0-9]/g,'')));
 const returned=normalize(hits),relevant=normalize(reference),truePositives=[...returned].filter(id=>relevant.has(id)).length;
 return {returned:returned.size,reference:relevant.size,truePositives,precision:returned.size?truePositives/returned.size:null,recall:relevant.size?truePositives/relevant.size:null,limitation:'按输入参考集的公开编号去重计算。'};
}
export class RetrievalExperiments{
 constructor(private readonly pool:Pool){}
 async create(input:unknown){
  const data=retrievalExperimentSchema.parse(input),scope=currentAccess();if(!scope)throw new Error('检索实验需要项目身份');
  return transaction(this.pool,async db=>{
   if(!(await db.query('SELECT id FROM datasets WHERE id=$1',[data.datasetId])).rowCount)throw new Error('数据集不存在或无访问权限');
   return (await db.query('INSERT INTO retrieval_experiments(id,organization_id,project_id,dataset_id,operator_id,method,query,started_at,ended_at,patent_numbers) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *,(extract(epoch FROM ended_at-started_at)*1000)::double precision AS duration_ms',[randomUUID(),scope.organizationId,scope.projectId,data.datasetId,scope.userId,data.method,data.query,data.startedAt,data.endedAt,JSON.stringify([...new Set(data.patentNumbers)])])).rows[0];
  });
 }
 async list(offset=0){z.number().int().nonnegative().safe().parse(offset);return (await connection(this.pool).query('SELECT *,(extract(epoch FROM ended_at-started_at)*1000)::double precision AS duration_ms FROM retrieval_experiments ORDER BY created_at DESC,id LIMIT 50 OFFSET $1',[offset])).rows;}
 async get(id:string){const row=(await connection(this.pool).query('SELECT *,(extract(epoch FROM ended_at-started_at)*1000)::double precision AS duration_ms FROM retrieval_experiments WHERE id=$1',[id])).rows[0];if(!row)throw new Error('检索实验不存在或无访问权限');return row;}
 async compare(id:string,input:unknown){const data=referenceSetSchema.parse(input),record=await this.get(id);return {id,durationMs:Number(record.duration_ms),...retrievalMetrics(record.patent_numbers,data.referencePatentNumbers)};}
}
