import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import type {Pool} from 'pg';
import {z} from 'zod';
import type {Patent} from '../lib/types';
import {currentAccess,transaction,connection} from './postgres';
import {PostgresStore} from './postgres-store';
import {normalize,datasetMeta} from './importers';
import {recordSchema} from './data-management';

const inputSchema=z.object({datasetId:z.string().min(1),sourceName:z.string().trim().min(1).max(300),sourceUrl:z.string().url(),observedAt:z.string().datetime(),records:z.array(z.record(z.unknown())).min(1).max(1000),resolutions:z.array(z.object({patentId:z.string().min(1),choice:z.enum(['keep-manual','accept-source']),expectedRecord:z.record(z.unknown())}).strict()).max(1000).default([]),windows:z.array(z.object({offset:z.number().int().nonnegative(),retrievedAt:z.string().datetime(),url:z.string().url(),received:z.number().int().nonnegative(),accepted:z.number().int().nonnegative()})).max(10).default([])}).strict();
const sourceRecordSchema=recordSchema.extend({claims:z.array(z.object({number:z.number().int().positive(),text:z.string().min(1),sourceStart:z.number().int().nonnegative().optional(),sourceEnd:z.number().int().nonnegative().optional()}).refine(claim=>(claim.sourceStart===undefined)===(claim.sourceEnd===undefined)&&(claim.sourceStart===undefined||claim.sourceEnd!>=claim.sourceStart),'原文偏移必须成对提供，结束位置不能早于起始位置')).refine(claims=>new Set(claims.map(claim=>claim.number)).size===claims.length,'权利要求编号不能重复').optional()});
function comparable(record:Patent){const value={...record} as unknown as Record<string,unknown>;delete value.embedding;delete value.editedAt;delete value.editedFields;return JSON.parse(JSON.stringify(value));}
function prepare(input:unknown){
 const data=inputSchema.parse(input);
 const records=data.records.map(raw=>{const validated=sourceRecordSchema.parse(raw);for(const claim of validated.claims||[])if(claim.sourceStart!==undefined&&(typeof raw.rawText!=='string'||raw.rawText.slice(claim.sourceStart,claim.sourceEnd)!==claim.text))throw new Error('来源权利要求偏移与原文不一致：'+validated.id+' 第'+claim.number+'项');return normalize({...raw,...validated,sourceName:validated.sourceName||data.sourceName,sourceUrl:validated.sourceUrl||data.sourceUrl},data.sourceName);});
 if(records.some(record=>!record.id)||new Set(records.map(record=>record.id)).size!==records.length)throw new Error('来源批次包含空编号或重复公开编号');
 if(new Set(data.resolutions.map(item=>item.patentId)).size!==data.resolutions.length||data.resolutions.some(item=>!records.some(record=>record.id===item.patentId)))throw new Error('冲突选择包含重复或不在本批次的公开编号');
 return {data,records};
}
function expected(record:Record<string,unknown>){const value={...record};delete value.embedding;return JSON.parse(JSON.stringify(value));}
export class SourceUpdates{
 constructor(private readonly pool:Pool){}
 async proposal(runId:string){return (await connection(this.pool).query('SELECT * FROM source_update_proposals WHERE run_id=$1',[runId])).rows[0];}
 async stage(input:unknown,runId:string){
  const {data}=prepare(input),scope=currentAccess();if(!scope)throw new Error('保存来源快照需要项目身份');if(data.resolutions.length)throw new Error('下载快照不能包含确认选择');
  return transaction(this.pool,async client=>{
   await client.query('SELECT id FROM datasets WHERE id=$1 FOR UPDATE',[data.datasetId]);const store=new PostgresStore(this.pool),run=await store.run(runId);if(!run||run.datasetId!==data.datasetId||!await store.dataset(data.datasetId))throw new Error('来源任务与数据集不匹配或无访问权限');
   const job=(await client.query('SELECT kind FROM jobs WHERE run_id=$1',[runId])).rows[0];if(job?.kind!=='source-update')throw new Error('该运行不是来源更新任务');
   await client.query('INSERT INTO source_update_proposals(run_id,organization_id,project_id,dataset_id,created_by,input) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(run_id) DO NOTHING',[runId,scope.organizationId,scope.projectId,data.datasetId,scope.userId,JSON.stringify(data)]);
   return (await this.proposal(runId))!;
  });
 }
 async preview(input:unknown){
  const {data,records}=prepare(input);return transaction(this.pool,async()=>{
   const store=new PostgresStore(this.pool);if(!await store.dataset(data.datasetId))throw new Error('数据集不存在或无访问权限');
   const conflicts=[];for(const incoming of records){const current=await store.patent(data.datasetId,incoming.id),editedFields=(current as (Patent&{editedFields?:string[]})|undefined)?.editedFields;if(current&&editedFields?.length&&!isDeepStrictEqual(comparable(current),comparable(incoming)))conflicts.push({patentId:incoming.id,editedFields,currentRecord:current,sourceRecord:incoming});}
   return {datasetId:data.datasetId,records:records.length,conflicts};
  },{repeatableRead:true,readOnly:true});
 }
 async apply(input:unknown,runId?:string){
  const {data,records}=prepare(input),scope=currentAccess();if(!scope)throw new Error('来源更新需要项目身份');
  return transaction(this.pool,async client=>{
   const locked=(await client.query('SELECT payload FROM datasets WHERE id=$1 FOR UPDATE',[data.datasetId])).rows[0];if(!locked)throw new Error('数据集不存在或无访问权限');
   if(runId){const run=await new PostgresStore(this.pool).run(runId);if(!run||run.datasetId!==data.datasetId)throw new Error('来源任务与数据集不匹配');const previous=(await client.query('SELECT id,counts FROM source_update_batches WHERE run_id=$1',[runId])).rows[0];if(previous)return previous;}
   if((await client.query("SELECT j.id FROM jobs j JOIN runs r ON r.id=j.run_id WHERE j.kind='fulltext' AND j.state IN('queued','running') AND r.payload->>'datasetId'=$1",[data.datasetId])).rowCount)throw new Error('该数据集正在建立全文索引，请任务结束后更新来源');
   const store=new PostgresStore(this.pool),counts={added:0,updated:0,unchanged:0},changes:{before?:Patent;after:Patent}[]=[],decisions:{patentId:string;choice:string;currentRecord:Patent;sourceRecord:Patent}[]=[];
   for(const incoming of records){
    const latest=(await client.query('SELECT max(b.observed_at) AS observed FROM source_record_observations o JOIN source_update_batches b ON b.id=o.batch_id WHERE b.dataset_id=$1 AND o.patent_id=$2 AND b.source_name=$3 AND b.source_url=$4',[data.datasetId,incoming.id,data.sourceName,data.sourceUrl])).rows[0].observed;
    if(latest&&new Date(data.observedAt).getTime()<new Date(latest).getTime())throw new Error('来源快照早于已保存的获取时点：'+incoming.id+'。本批次未入库。');
    const before=await store.patent(data.datasetId,incoming.id);
    const resolution=data.resolutions.find(item=>item.patentId===incoming.id);
    if(resolution&&(!before||!isDeepStrictEqual(expected(before as unknown as Record<string,unknown>),expected(resolution.expectedRecord))))throw new Error('记录在冲突确认前已变更：'+incoming.id+'。请重新读取并选择，本批次未入库。');
    if(before&&isDeepStrictEqual(comparable(before),comparable(incoming))){if(resolution)throw new Error('该记录已与来源一致，无需冲突选择：'+incoming.id);counts.unchanged++;continue;}
    const editedFields=(before as (Patent&{editedFields?:string[]})|undefined)?.editedFields;
    if(editedFields?.length){
     if(!resolution)throw new Error('来源更新与手工修订冲突：'+incoming.id+'（'+editedFields.join('、')+'）。请先核对并处理修订；本批次未入库。');
     decisions.push({patentId:incoming.id,choice:resolution.choice,currentRecord:before!,sourceRecord:incoming});
     if(resolution.choice==='keep-manual'){counts.unchanged++;changes.push({before,after:before!});continue;}
     delete (incoming as Patent&{editedFields?:string[]}).editedFields;delete (incoming as Patent&{editedAt?:string}).editedAt;
    }else if(resolution)throw new Error('该记录没有待处理的手工修订冲突：'+incoming.id);
    if(before?.embedding&&before.title===incoming.title&&before.abstract===incoming.abstract)incoming.embedding=before.embedding;
    else delete incoming.embedding;
    changes.push({before,after:incoming});if(before)counts.updated++;else counts.added++;
   }
   const id=randomUUID();await client.query('INSERT INTO source_update_batches(id,organization_id,project_id,dataset_id,source_name,source_url,observed_at,created_by,counts,source_windows,run_id,decisions) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[id,scope.organizationId,scope.projectId,data.datasetId,data.sourceName,data.sourceUrl,data.observedAt,scope.userId,JSON.stringify(counts),JSON.stringify(data.windows),runId||null,JSON.stringify(decisions)]);
   for(const record of records)await client.query('INSERT INTO source_record_observations(batch_id,patent_id) VALUES($1,$2)',[id,record.id]);
   for(const {before,after} of changes){
    const revision=Number((await client.query('SELECT coalesce(max(revision),0)+1 AS next FROM source_record_versions WHERE dataset_id=$1 AND patent_id=$2',[data.datasetId,after.id])).rows[0].next);
    await client.query('INSERT INTO source_record_versions(id,batch_id,organization_id,project_id,dataset_id,patent_id,revision,before_record,after_record) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[randomUUID(),id,scope.organizationId,scope.projectId,data.datasetId,after.id,revision,before?JSON.stringify(before):null,JSON.stringify(after)]);
    await client.query('INSERT INTO patents(dataset_id,id,payload) VALUES($1,$2,$3) ON CONFLICT(dataset_id,id) DO UPDATE SET payload=excluded.payload',[data.datasetId,after.id,JSON.stringify(after)]);
    if(before&&(before.description!==after.description||!isDeepStrictEqual(before.claims,after.claims)))await store.clearCheckpoints(data.datasetId,after.id);
   }
   const previous=locked.payload,meta=datasetMeta(previous.name,await store.analysisPatents(data.datasetId),previous.source,previous.sampling);await store.updateDataset({...previous,count:meta.count,indexed:meta.indexed,coverage:meta.coverage,years:meta.years,warnings:meta.warnings});
   if(counts.added+counts.updated>0)await client.query('UPDATE datasets SET source_revision=source_revision+1 WHERE id=$1',[data.datasetId]);
   return {id,counts};
  });
 }
 async batches(datasetId:string){return (await connection(this.pool).query('SELECT * FROM source_update_batches WHERE dataset_id=$1 ORDER BY created_at DESC,id LIMIT 50',[datasetId])).rows;}
 async forRun(runId:string){return (await connection(this.pool).query('SELECT * FROM source_update_batches WHERE run_id=$1',[runId])).rows[0];}
 async versions(datasetId:string,patentId:string){return (await connection(this.pool).query('SELECT * FROM source_record_versions WHERE dataset_id=$1 AND patent_id=$2 ORDER BY revision DESC',[datasetId,patentId])).rows;}
 async versionPage(datasetId:string,patentId:string,page=1){
  z.string().min(1).parse(datasetId);z.string().min(1).parse(patentId);z.number().int().positive().parse(page);
  return transaction(this.pool,async client=>{
   if(!await new PostgresStore(this.pool).dataset(datasetId))throw new Error('数据集不存在或无访问权限');
   const total=Number((await client.query('SELECT count(*)::int AS n FROM source_record_versions WHERE dataset_id=$1 AND patent_id=$2',[datasetId,patentId])).rows[0].n),pages=Math.max(1,Math.ceil(total/10)),actual=Math.min(page,pages);
   const versions=(await client.query('SELECT v.*,b.source_name,b.source_url,b.observed_at FROM source_record_versions v JOIN source_update_batches b ON b.id=v.batch_id WHERE v.dataset_id=$1 AND v.patent_id=$2 ORDER BY v.revision DESC LIMIT 10 OFFSET $3',[datasetId,patentId,(actual-1)*10])).rows;
   return {versions,total,page:actual,pages,pageSize:10};
  },{repeatableRead:true,readOnly:true});
 }
}
