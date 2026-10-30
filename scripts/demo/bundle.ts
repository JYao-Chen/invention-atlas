import {createReadStream} from 'node:fs';
import {createGunzip} from 'node:zlib';
import {createInterface} from 'node:readline';
import type {Pool} from 'pg';
import {transaction} from '../../src/server/postgres';
import {upsertExternal,type ExternalTable} from '../../src/server/external/store';
import type {Dataset,Patent,AnalysisResult} from '../../src/lib/types';

export const VERSION='demo-data-v1';
export const RELEASE='https://github.com/JYao-Chen/invention-atlas/releases/download/'+VERSION+'/';
export const externalTables=['external_sources','ext_patent_paper_links','ext_papers','external_source_seeds'] as const;
export type Header={kind:'header';version:string;part:'core'|'papers';counts:Record<string,number>;defaultDatasetId:string;embedding:{model:string;dimensions:number;input:string}};
export type Entry=Header|{kind:'dataset';value:Dataset}|{kind:'patent';datasetId:string;value:Patent}|{kind:'example';title:string;answer:string;result:AnalysisResult}|{kind:'external';table:typeof externalTables[number];value:Record<string,unknown>};
export async function* readBundle(path:string):AsyncGenerator<Entry>{
 const input=createReadStream(path),gunzip=createGunzip();input.on('error',error=>gunzip.destroy(error));input.pipe(gunzip);
 const lines=createInterface({input:gunzip,crlfDelay:Infinity});
 try{for await(const line of lines)if(line.trim())yield JSON.parse(line);}finally{lines.close();input.destroy();gunzip.destroy();}
}
export async function importBundle(pool:Pool,path:string,target:{userId:string;organizationId:string;projectId:string}){
 return transaction(pool,async client=>{
  // Imports use a maintenance connection; all project-owned rows receive the chosen destination.
  await client.query('SELECT pg_advisory_xact_lock(3017010)');
  const member=await client.query("SELECT 1 FROM project_members WHERE user_id=$1 AND organization_id=$2 AND project_id=$3 AND role='owner'",[target.userId,target.organizationId,target.projectId]);
  if(!member.rowCount)throw new Error('演示数据目标必须是该用户拥有的项目');
  await client.query("SELECT set_config('app.organization_id',$1,true),set_config('app.project_id',$2,true)",[target.organizationId,target.projectId]);
  let header:Header|undefined,counts:Record<string,number>={};const datasets=new Map<string,Dataset>(),batches=new Map<ExternalTable,Record<string,unknown>[]>();
  for await(const entry of readBundle(path)){
   if(!header){
    if(entry.kind!=='header'||entry.version!==VERSION||!['core','papers'].includes(entry.part))throw new Error('演示数据版本或文件头不匹配');
    header=entry;const marker=VERSION+':'+header.part;
    if((await client.query('SELECT 1 FROM settings WHERE key=$1 AND project_id=$2',[marker,target.projectId])).rowCount)return {part:header.part,skipped:true,counts:{}};
    if(header.part==='papers'&&!(await client.query('SELECT 1 FROM settings WHERE key=$1 AND project_id=$2',[VERSION+':core',target.projectId])).rowCount)throw new Error('请先导入核心演示数据');
    continue;
   }
   if(entry.kind==='dataset'&&header.part==='core'){
    const meta=entry.value;
    if((await client.query('SELECT 1 FROM datasets WHERE id=$1',[meta.id])).rowCount)throw new Error('该演示数据集编号已存在；请使用新的目标数据库');
    datasets.set(meta.id,meta);await client.query('INSERT INTO datasets(id,payload) VALUES($1,$2)',[meta.id,JSON.stringify(meta)]);counts.datasets=(counts.datasets||0)+1;
   }else if(entry.kind==='patent'&&header.part==='core'){
    const patent=entry.value;
    if(!datasets.has(entry.datasetId)||!patent.id||!patent.title||!Array.isArray(patent.embedding)||patent.embedding.length!==header.embedding.dimensions||patent.embedding.some(v=>!Number.isFinite(v)))throw new Error('演示专利记录或嵌入向量不完整');
    await client.query('INSERT INTO patents(dataset_id,id,payload) VALUES($1,$2,$3)',[entry.datasetId,patent.id,JSON.stringify(patent)]);counts.patents=(counts.patents||0)+1;
   }else if(entry.kind==='example'&&header.part==='core'){
    if(!datasets.has(entry.result.datasetId))throw new Error('示例引用的数据集不存在');
    const id='demo-'+entry.result.tool,now=new Date().toISOString(),run={id,conversationId:id,datasetId:entry.result.datasetId,question:entry.title,status:'completed',plan:[{tool:entry.result.tool,params:entry.result.params}],results:[entry.result],answer:entry.answer,error:'',model:'预计算演示',createdAt:now};
    await client.query('INSERT INTO conversations(id,dataset_id,title,updated_at) VALUES($1,$2,$3,$4)',[id,run.datasetId,entry.title,now]);
    await client.query('INSERT INTO runs(id,conversation_id,payload) VALUES($1,$1,$2)',[id,JSON.stringify(run)]);
    await client.query('INSERT INTO results(id,payload) VALUES($1,$2)',[entry.result.id,JSON.stringify(entry.result)]);
    await client.query('INSERT INTO reports(id,title,run_id,payload,created_at) VALUES($1,$2,$1,$3,$4)',[id,entry.title,JSON.stringify({run}),now]);counts.examples=(counts.examples||0)+1;
   }else if(entry.kind==='external'&&header.part==='papers'&&externalTables.includes(entry.table)){
    const batch=batches.get(entry.table)||[];batch.push(entry.value);batches.set(entry.table,batch);
    if(batch.length===(entry.table==='external_sources'?1:100)){await upsertExternal(pool,entry.table,batch);batch.length=0;}
    counts[entry.table]=(counts[entry.table]||0)+1;
   }else throw new Error('演示包包含不支持的记录类型');
  }
  if(!header)throw new Error('演示文件为空');
  for(const [table,batch] of batches)if(batch.length)await upsertExternal(pool,table,batch);
  for(const [key,count] of Object.entries(header.counts))if((counts[key]||0)!==count)throw new Error('演示数据条数不符：'+key);
  for(const meta of datasets.values()){
   const actual=Number((await client.query('SELECT count(*) AS n FROM patents WHERE dataset_id=$1',[meta.id])).rows[0].n);
   if(actual!==meta.count||meta.indexed!==actual)throw new Error('数据集记录数或索引数不符：'+meta.name);
  }
  await client.query('INSERT INTO settings(key,value) VALUES($1,$2)',[VERSION+':'+header.part,JSON.stringify({counts,installedAt:new Date().toISOString()})]);
  if(header.part==='core')await client.query('INSERT INTO user_preferences(user_id,key,value) VALUES($1,$2,$3) ON CONFLICT(user_id,key) DO UPDATE SET value=excluded.value',[target.userId,'active_dataset:'+target.projectId,header.defaultDatasetId]);
  return {part:header.part,skipped:false,counts};
 });
}
