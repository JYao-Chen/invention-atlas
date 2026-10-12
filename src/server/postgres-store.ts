import type {Pool} from 'pg';
import type {Dataset,Patent,AnalysisPatent,Conversation,Run,AnalysisResult} from '@/lib/types';
import {randomUUID} from 'node:crypto';
import {transaction,connection,currentAccess} from './postgres';

export class PostgresStore {
 constructor(private readonly pool:Pool){}
 private get connection(){return connection(this.pool);}

 async setting(key:string,value?:string):Promise<string|undefined>{
  const scope=currentAccess();
  if(scope&&key==='active_dataset'){
   const preferenceKey=key+':'+scope.projectId;
   if(value!==undefined)await this.connection.query('INSERT INTO user_preferences(user_id,key,value) VALUES($1,$2,$3) ON CONFLICT(user_id,key) DO UPDATE SET value=excluded.value',[scope.userId,preferenceKey,value]);
   return (await this.connection.query('SELECT value FROM user_preferences WHERE user_id=$1 AND key=$2',[scope.userId,preferenceKey])).rows[0]?.value;
  }
  if(value!==undefined)await this.connection.query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value',[key,value]);
  return (await this.connection.query('SELECT value FROM settings WHERE key=$1',[key])).rows[0]?.value;
 }

 async datasets():Promise<Dataset[]>{
  return (await this.connection.query('SELECT payload FROM datasets ORDER BY position DESC')).rows.map(row=>row.payload);
 }

 async dataset(id?:string):Promise<Dataset|undefined>{
  const selected=id||await this.setting('active_dataset');
  if(selected){const row=(await this.connection.query('SELECT payload FROM datasets WHERE id=$1',[selected])).rows[0];if(row)return row.payload;}
  return id?undefined:(await this.datasets())[0];
 }

 async patent(datasetId:string,id:string):Promise<Patent|undefined>{
  return (await this.connection.query('SELECT payload FROM patents WHERE dataset_id=$1 AND id=$2',[datasetId,id])).rows[0]?.payload;
 }

 async patents(datasetId:string):Promise<Patent[]>{
  return (await this.connection.query('SELECT payload FROM patents WHERE dataset_id=$1 ORDER BY id',[datasetId])).rows.map(row=>row.payload);
 }

 async analysisPatents(datasetId:string):Promise<AnalysisPatent[]>{
  const result=await this.connection.query(`SELECT (payload-'rawText'-'description'-'locations') || jsonb_build_object('rawText','','description','','locations','{}'::jsonb,'deferredText',jsonb_build_object('descriptionChars',length(coalesce(payload->>'description','')))) AS payload FROM patents WHERE dataset_id=$1 ORDER BY id`,[datasetId]);
  return result.rows.map(row=>row.payload);
 }

 async fullPatent(datasetId:string,record:AnalysisPatent):Promise<Patent>{
  if(!record.deferredText)return record;
  const original=await this.patent(datasetId,record.id);
  if(!original)throw new Error('原始专利记录不存在：'+record.id);
  return {...original,applicants:record.applicants};
 }

 async patentPage(datasetId:string,query:string,page:number,label?:{id:string;includeChildren:boolean}){
  const scope=currentAccess();if(label&&!scope)throw new Error('标签筛选需要项目身份');
  const selectedLabels=`WITH RECURSIVE selected_labels AS (SELECT id FROM project_labels WHERE id=$3 AND project_id=$4 UNION ALL SELECT child.id FROM project_labels child JOIN selected_labels parent ON child.parent_id=parent.id WHERE child.project_id=$4 AND $5::boolean) SELECT id FROM selected_labels`;
  const where=`dataset_id=$1 AND ($2='' OR strpos(lower(id||' '||coalesce(payload->>'title','')||' '||coalesce((SELECT string_agg(value,' ') FROM jsonb_array_elements_text(payload->'applicants') AS a(value)),'')),$2)>0) AND ($3='' OR EXISTS(SELECT 1 FROM patent_annotations annotation WHERE annotation.dataset_id=patents.dataset_id AND annotation.patent_id=patents.id AND annotation.project_id=$4 AND annotation.status='confirmed' AND annotation.label_id IN (${selectedLabels})))`;
  const args=[datasetId,query.toLowerCase(),label?.id||'',scope?.projectId||'',label?.includeChildren||false];
  return transaction(this.pool,async client=>{
   const total=Number((await client.query(`SELECT count(*) n FROM patents WHERE ${where}`,args)).rows[0].n);
   const result=await client.query(`SELECT (payload-'embedding'-'rawText'-'description'-'claims') || jsonb_build_object('claimCount',jsonb_array_length(payload->'claims'),'descriptionChars',length(coalesce(payload->>'description',''))) AS payload FROM patents WHERE ${where} ORDER BY id LIMIT 20 OFFSET $6`,[...args,(page-1)*20]);
   return {total,page,records:result.rows.map(row=>row.payload)};
  },{repeatableRead:true,readOnly:true});
 }

 async saveDataset(meta:Dataset,records:Patent[]){
  await transaction(this.pool,async client=>{
   await client.query('INSERT INTO datasets(id,payload) VALUES($1,$2)',[meta.id,JSON.stringify(meta)]);
   for(const record of records)await client.query('INSERT INTO patents(dataset_id,id,payload) VALUES($1,$2,$3)',[meta.id,record.id,JSON.stringify(record)]);
   await this.setting('active_dataset',meta.id);
  });
 }

 async savePatent(datasetId:string,record:Patent){
  await this.connection.query('UPDATE patents SET payload=$1 WHERE dataset_id=$2 AND id=$3',[JSON.stringify(record),datasetId,record.id]);
 }

 async updateDataset(meta:Dataset){
  await transaction(this.pool,async client=>{
   await client.query('UPDATE datasets SET payload=$1 WHERE id=$2',[JSON.stringify(meta),meta.id]);
   await client.query('DELETE FROM settings WHERE key=$1',['starter-pool:'+meta.id]);
  });
 }

 async conversations():Promise<Conversation[]>{
  return (await this.connection.query('SELECT id,dataset_id AS "datasetId",title,updated_at AS "updatedAt" FROM conversations ORDER BY updated_at DESC')).rows;
 }

 async newConversation(datasetId:string,title='新对话'):Promise<Conversation>{
  const conversation={id:randomUUID(),datasetId,title,updatedAt:new Date().toISOString()};
  await this.connection.query('INSERT INTO conversations(id,dataset_id,title,updated_at) VALUES($1,$2,$3,$4)',[conversation.id,datasetId,title,conversation.updatedAt]);
  return conversation;
 }

 async renameConversation(id:string,title:string){
  await this.connection.query('UPDATE conversations SET title=$1 WHERE id=$2',[title,id]);
 }

 async saveEmbeddings(datasetId:string,records:{id:string;embedding:number[]}[]){
  await transaction(this.pool,async client=>{
   for(const record of records)await client.query("UPDATE patents SET payload=jsonb_set(payload,'{embedding}',$1::jsonb) WHERE dataset_id=$2 AND id=$3",[JSON.stringify(record.embedding),datasetId,record.id]);
  });
 }

 async runs(conversationId?:string):Promise<Run[]>{
  const result=conversationId?await this.connection.query('SELECT payload FROM runs WHERE conversation_id=$1 ORDER BY position',[conversationId]):await this.connection.query('SELECT payload FROM runs ORDER BY position DESC');
  return result.rows.map(row=>row.payload);
 }

 async run(id:string):Promise<Run|undefined>{
  return (await this.connection.query('SELECT payload FROM runs WHERE id=$1',[id])).rows[0]?.payload;
 }

 async saveRun(run:Run){
  await transaction(this.pool,async client=>{
   await client.query('INSERT INTO runs(id,conversation_id,payload) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET conversation_id=excluded.conversation_id,payload=excluded.payload',[run.id,run.conversationId,JSON.stringify(run)]);
   await client.query('UPDATE conversations SET updated_at=$1 WHERE id=$2',[new Date().toISOString(),run.conversationId]);
  });
 }

 async finishRun(run:Run){
  await transaction(this.pool,async()=>{
   await this.saveRun(run);
   if(run.error)await this.event(run.id,'error',{message:run.error});
   await this.event(run.id,'done',{status:run.status});
  });
 }

 async event(id:string,name:string,payload:unknown){
  const result=await this.connection.query('INSERT INTO events(run_id,event,payload) VALUES($1,$2,$3) RETURNING seq',[id,name,JSON.stringify(payload)]);
  return Number(result.rows[0].seq);
 }

 async events(id:string,after=0):Promise<{seq:number;event:string;payload:string}[]>{
  return (await this.connection.query('SELECT seq,event,payload FROM events WHERE run_id=$1 AND seq>$2 ORDER BY seq',[id,after])).rows.map(row=>({seq:Number(row.seq),event:row.event,payload:JSON.stringify(row.payload)}));
 }

 async saveResult(result:AnalysisResult){
  await this.connection.query('INSERT INTO results(id,payload) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',[result.id,JSON.stringify(result)]);
 }

 async savedResult(id:string):Promise<AnalysisResult|undefined>{
  return (await this.connection.query('SELECT payload FROM results WHERE id=$1',[id])).rows[0]?.payload;
 }

 async savedResults(datasetId:string):Promise<AnalysisResult[]>{
  return (await this.connection.query("SELECT payload FROM results WHERE payload->>'datasetId'=$1 ORDER BY position DESC LIMIT 24",[datasetId])).rows.map(row=>row.payload);
 }

 async saveReport(run:Run,title:string){
  const id=randomUUID();
  await this.connection.query('INSERT INTO reports(id,title,run_id,payload,created_at) VALUES($1,$2,$3,$4,$5)',[id,title,run.id,JSON.stringify({run}),new Date().toISOString()]);
  return id;
 }

 async reports():Promise<{id:string;title:string;createdAt:string;run:Run}[]>{
  return (await this.connection.query('SELECT id,title,created_at,payload FROM reports ORDER BY created_at DESC')).rows.map(row=>({id:row.id,title:row.title,createdAt:row.created_at,...row.payload}));
 }

 async deleteSaved(kind:'reports'|'conversations',input:string[],isActive:(id:string)=>boolean=()=>false){
  const ids=[...new Set(input.map(id=>id.trim()))];
  if(!ids.length||ids.some(id=>!id))throw new Error('请选择有效记录');
  return transaction(this.pool,async client=>{
   const found=await client.query(`SELECT id FROM ${kind} WHERE id=ANY($1::text[]) FOR UPDATE`,[ids]);
   if(found.rowCount!==ids.length)throw new Error(kind==='reports'?'报告不存在':'对话不存在');
   if(kind==='conversations'){
    const saved=await client.query("SELECT r.id,r.payload->>'status' AS status,EXISTS(SELECT 1 FROM jobs j WHERE j.run_id=r.id AND j.state IN('queued','running')) AS queued FROM runs r WHERE r.conversation_id=ANY($1::text[])",[ids]);
    if(saved.rows.some(row=>row.status==='running'||row.queued||isActive(row.id)))throw new Error('请先停止选中对话中正在运行的任务');
    const runIds=saved.rows.map(row=>row.id);
    await client.query('DELETE FROM events WHERE run_id=ANY($1::text[])',[runIds]);
    await client.query('DELETE FROM settings WHERE key=ANY($1::text[])',[runIds.map(id=>'evaluation:'+id)]);
    await client.query('DELETE FROM runs WHERE conversation_id=ANY($1::text[])',[ids]);
   }
   await client.query(`DELETE FROM ${kind} WHERE id=ANY($1::text[])`,[ids]);
   return {deleted:ids.length,ids};
  });
 }

 async createSession(token:string,expiresAt:number){
  await this.connection.query('INSERT INTO sessions(token,expires_at) VALUES($1,$2)',[token,expiresAt]);
 }

 async sessionValid(token:string,now=Date.now()){
  return Boolean((await this.connection.query('SELECT 1 FROM sessions WHERE token=$1 AND expires_at>$2',[token,now])).rowCount);
 }

 async deleteSession(token:string){await this.connection.query('DELETE FROM sessions WHERE token=$1',[token]);}

 async monitor(key:string):Promise<Patent[]|undefined>{
  return (await this.connection.query('SELECT payload FROM monitors WHERE key=$1',[key])).rows[0]?.payload;
 }

 async saveMonitor(key:string,records:Omit<Patent,'embedding'|'rawText'|'locations'>[]){
  await this.connection.query('INSERT INTO monitors(key,payload) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload',[key,JSON.stringify(records)]);
 }

 async claimCheckpoint(datasetId:string,patentId:string,method:string,claim:number,start:number):Promise<Record<string,unknown>[]|undefined>{
  return (await this.connection.query('SELECT payload FROM claim_checkpoints WHERE dataset_id=$1 AND patent_id=$2 AND method=$3 AND claim_number=$4 AND chunk_start=$5',[datasetId,patentId,method,claim,start])).rows[0]?.payload;
 }

 async saveClaimCheckpoint(datasetId:string,patentId:string,method:string,claim:number,start:number,rows:unknown){
  await this.connection.query('INSERT INTO claim_checkpoints(dataset_id,patent_id,method,claim_number,chunk_start,payload) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(dataset_id,patent_id,method,claim_number,chunk_start) DO UPDATE SET payload=excluded.payload',[datasetId,patentId,method,claim,start,JSON.stringify(rows)]);
 }

 async effectCheckpoint(datasetId:string,patentId:string,method:string,section:string,start:number):Promise<{technology:string;effect:string;quote:string}[]|undefined>{
  return (await this.connection.query('SELECT payload FROM effect_checkpoints WHERE dataset_id=$1 AND patent_id=$2 AND method=$3 AND section=$4 AND chunk_start=$5',[datasetId,patentId,method,section,start])).rows[0]?.payload;
 }

 async saveEffectCheckpoint(datasetId:string,patentId:string,method:string,section:string,start:number,rows:unknown){
  await this.connection.query('INSERT INTO effect_checkpoints(dataset_id,patent_id,method,section,chunk_start,payload) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(dataset_id,patent_id,method,section,chunk_start) DO UPDATE SET payload=excluded.payload',[datasetId,patentId,method,section,start,JSON.stringify(rows)]);
 }

 async comparisonCheckpoint(key:string):Promise<unknown>{
  return (await this.connection.query('SELECT payload FROM comparison_checkpoints WHERE key_hash=md5($1) AND key=$1',[key])).rows[0]?.payload;
 }

 async saveComparisonCheckpoint(key:string,value:unknown){
  await this.connection.query('INSERT INTO comparison_checkpoints(key,payload) VALUES($1,$2) ON CONFLICT(key_hash) DO UPDATE SET payload=excluded.payload WHERE comparison_checkpoints.key=excluded.key',[key,JSON.stringify(value)]);
 }

 async clearCheckpoints(datasetId:string,patentId?:string){
  await transaction(this.pool,async client=>{
   for(const table of ['claim_checkpoints','effect_checkpoints'])await client.query(`DELETE FROM ${table} WHERE dataset_id=$1${patentId?' AND patent_id=$2':''}`,patentId?[datasetId,patentId]:[datasetId]);
   // Existing comparison keys encode datasetId as the second JSON array member.
   await client.query('DELETE FROM comparison_checkpoints WHERE key::jsonb->>1=$1',[datasetId]);
  });
 }
}
