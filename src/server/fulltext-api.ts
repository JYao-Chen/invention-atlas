import {z} from 'zod';
import {db,dataset} from './db';
import {ChunkStore} from './chunk-store';
import {modelConfig} from './config';
import {embed} from './model';
import {submitFulltextIndex} from './fulltext-job';
import {connection} from './postgres';
import {PostgresStore} from './postgres-store';
import {JobStore} from './job-store';
import {estimateFulltext} from './fulltext-estimate';

const store=new ChunkStore(db);
const versionSchema=z.string().trim().min(1).max(100);
export async function fulltextEndpoint(request:Request,path:string[]):Promise<Response|undefined>{
 if(path[0]!=='fulltext')return undefined;
 const url=new URL(request.url),action=path[1],cfg=modelConfig();
 if(action==='estimate'&&request.method==='POST'){
  const input=z.object({datasetId:z.string().min(1),version:versionSchema,patentIds:z.array(z.string().min(1)).min(1).optional()}).parse(await request.json());
  if(!await dataset(input.datasetId))throw new Error('数据集不存在或无访问权限');
  const records=new PostgresStore(db),ids=input.patentIds||((await connection(db).query('SELECT id FROM patents WHERE dataset_id=$1 ORDER BY id',[input.datasetId])).rows.map(row=>row.id as string));
  return Response.json({...await estimateFulltext({patentIds:ids,version:input.version,read:id=>records.patent(input.datasetId,id),signal:request.signal}),model:cfg.embedding,dimensions:1024,saved:false});
 }
 if(action==='jobs'){
  if(request.method==='POST'&&!path[2])return Response.json(await submitFulltextIndex(db,await request.json(),cfg.embedding),{status:202});
  if(request.method==='GET'){
   const datasetId=z.string().min(1).parse(url.searchParams.get('dataset'));if(!await dataset(datasetId))throw new Error('数据集不存在或无访问权限');
   const jobs=(await connection(db).query("SELECT j.id,j.run_id AS \"runId\",j.state,j.payload,j.error,r.payload AS run FROM jobs j JOIN runs r ON r.id=j.run_id WHERE j.kind='fulltext' AND r.payload->>'datasetId'=$1 ORDER BY j.created_at DESC LIMIT 20",[datasetId])).rows;
   return Response.json({jobs},{headers:{'Cache-Control':'no-store'}});
  }
  if(request.method==='POST'&&path[2]&&path[3]==='cancel'){
   const job=await new JobStore(db).get(path[2]);if(!job||job.kind!=='fulltext')throw new Error('全文索引任务不存在或无访问权限');
   const cancelRequested=await new JobStore(db).cancel(job.id);
   if(cancelRequested){const cancelled=await new JobStore(db).get(job.id);if(cancelled?.state==='cancelled'){const records=new PostgresStore(db),run=await records.run(job.runId);if(run?.status==='running'){run.status='cancelled';run.error='全文索引任务已取消';await records.finishRun(run);}}}
   return Response.json({cancelRequested});
  }
  if(request.method==='POST'&&path[2]&&path[3]==='retry'){
   const job=await new JobStore(db).get(path[2]);if(!job||job.kind!=='fulltext'||!['failed','cancelled'].includes(job.state))throw new Error('只有失败或取消的全文索引可以重试');
   const previous=await new PostgresStore(db).run(job.runId);if(!previous)throw new Error('原索引范围已不可访问');
   if(job.payload.model!==cfg.embedding)throw new Error('嵌入模型已改变，请重新提交新模型索引');
   return Response.json(await submitFulltextIndex(db,{datasetId:previous.datasetId,version:job.payload.version,patentIds:job.payload.patentIds},cfg.embedding),{status:202});
  }
  return Response.json({error:'全文任务不支持此操作'},{status:405});
 }
 if(request.method==='GET'){
  const datasetId=z.string().min(1).parse(url.searchParams.get('dataset'));
  if(!await dataset(datasetId))throw new Error('数据集不存在或无访问权限');
  if(action==='versions')return Response.json({versions:await store.versions(datasetId,cfg.embedding,1024),model:cfg.embedding,dimensions:1024});
  const version=versionSchema.parse(url.searchParams.get('version'));
  if(action==='source'){
   const patentId=z.string().min(1).parse(url.searchParams.get('patent'));
   const ordinal=z.coerce.number().int().min(0).parse(z.string().min(1).parse(url.searchParams.get('ordinal')));
   const source=await store.source(datasetId,patentId,version,ordinal);
   return source?Response.json(source):Response.json({error:'原文片段不存在或无访问权限'},{status:404});
  }
  const status=await store.progress(datasetId,version,cfg.embedding,1024);
  if(action==='status')return Response.json({...status,version,model:cfg.embedding,dimensions:1024});
  if(action==='search'){
   const query=z.string().trim().min(1).max(7000).parse(url.searchParams.get('q'));
   const limit=z.coerce.number().int().min(1).max(100).default(20).parse(url.searchParams.get('limit')||undefined);
   const patentIds=url.searchParams.has('patents')?url.searchParams.get('patents')!.split(',').filter(Boolean):undefined;
   const scope=z.enum(['current','historical']).parse(url.searchParams.get('scope')||'current'),currentOnly=scope==='current',alignment=await store.alignment(datasetId,version,patentIds),warning=scope==='historical'?'当前检索明确包含历史原文，不代表现有数据集的最新内容。':alignment.changed+alignment.removed?`已排除${alignment.changed}件内容变化和${alignment.removed}件已移除专利的历史索引；请为最新原文建立新版本。`:'';
   if(!status.total)return Response.json({hits:[],status:'unavailable',reason:'指定原文版本尚未建立片段索引',version});
   if(currentOnly&&!alignment.current)return Response.json({hits:[],status:'unavailable',reason:'指定索引范围没有与当前原文一致的文档，请建立新版本或明确检索历史原文。',alignment,scope,warning,version});
   if(!status.done)return Response.json({hits:(await store.keyword(datasetId,version,query,limit,patentIds,currentOnly)).map(hit=>({...hit,matches:['keyword']})),method:'keyword-only',reason:'指定模型尚无片段向量',...status,alignment,scope,warning,version});
   const vectors=await embed([query],request.signal);
   if(modelConfig().embedding!==cfg.embedding)throw new Error('嵌入模型已改变，请重新检索');
   return Response.json({...await store.hybrid(datasetId,version,query,cfg.embedding,vectors[0],limit,patentIds,currentOnly),...status,alignment,scope,warning,version,indexComplete:status.done===status.total});
  }
 }
 return Response.json({error:'全文接口不支持此操作'},{status:405});
}
