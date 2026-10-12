import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Pool} from 'pg';
import type {Run} from '../lib/types';
import {transaction} from './postgres';
import {PostgresStore} from './postgres-store';
import {JobStore,type Job} from './job-store';
import {ChunkStore} from './chunk-store';
import {indexFulltext} from './fulltext-index';
import {modelConfig} from './config';
import {embed} from './model';
const inputSchema=z.object({datasetId:z.string().min(1),version:z.string().trim().min(1).max(100),patentIds:z.array(z.string().min(1)).min(1).optional()});
const payloadSchema=z.object({version:z.string().min(1),model:z.string().min(1),dimensions:z.literal(1024),patentIds:z.array(z.string().min(1)).min(1)});
export async function submitFulltextIndex(pool:Pool,input:unknown,model:string){
 const data=inputSchema.parse(input),store=new PostgresStore(pool);
 return transaction(pool,async client=>{
  await client.query('SELECT id FROM datasets WHERE id=$1 FOR UPDATE',[data.datasetId]);
  const meta=await store.dataset(data.datasetId);if(!meta)throw new Error('数据集不存在或无访问权限');
  const ids=(await client.query('SELECT id FROM patents WHERE dataset_id=$1 ORDER BY id',[meta.id])).rows.map(row=>row.id as string),selected=[...new Set(data.patentIds||ids)];
  if(!selected.length||selected.some(id=>!ids.includes(id)))throw new Error('索引范围为空或包含当前数据集以外的专利');
  if((await client.query("SELECT j.id FROM jobs j JOIN runs r ON r.id=j.run_id WHERE j.kind IN('fulltext','source-update') AND j.state IN('queued','running') AND r.payload->>'datasetId'=$1",[meta.id])).rowCount)throw new Error('该数据集已有全文索引或来源更新任务');
  const conversation=await store.newConversation(meta.id,'全文索引 · '+data.version);
  const run:Run={id:randomUUID(),conversationId:conversation.id,datasetId:meta.id,datasetSnapshot:meta,question:'建立全文索引：'+data.version,status:'running',plan:[],results:[],answer:'',error:'',model,createdAt:new Date().toISOString(),progress:{tool:'queue',unit:'等待后台建立全文索引'}};
  await store.saveRun(run);await new JobStore(pool).enqueue(run.id,'fulltext',{version:data.version,model,dimensions:1024,patentIds:selected});await store.event(run.id,'status',{phase:'Queued',message:'全文索引范围已保存，等待后台执行'});return run;
 });
}
export async function executeFulltextIndex(pool:Pool,job:Job,run:Run,signal:AbortSignal){
 const payload=payloadSchema.parse(job.payload),store=new PostgresStore(pool);
 const result=await indexFulltext({store:new ChunkStore(pool),datasetId:run.datasetId,...payload,signal,read:id=>store.patent(run.datasetId,id),embed:async(texts,control)=>{if(modelConfig().embedding!==payload.model)throw new Error('嵌入模型已改变，原任务不能混用新模型');return embed(texts,control);},progress:async progress=>{run.progress={tool:'fulltext',done:progress.done,total:progress.total,unit:progress.stage==='documents'?'专利原文':'全文片段'};await store.saveRun(run);await store.event(run.id,'progress',run.progress);}});
 run.answer=`全文索引已完成：${result.documents}件专利，${result.done}/${result.total}个片段。版本 ${result.version}，模型 ${result.model}。`;
}
