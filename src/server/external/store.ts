import type {Pool} from 'pg';
import {connection,transaction,currentAccess} from '../postgres';
import {normalizePatentNumber,patentNumber} from './patent-number';
const columns={
 external_sources:['id','name','version','url','license','retrieved_at','sha256','row_count','bytes','subset_rule','notes'],
 ext_patents:['patent_number','patent_type','application_date','grant_date','cpc','assignees','assignee_countries','claims_count','source_id'],
 ext_patent_citations:['citing_patent','cited_patent','category','purpose','source_id'],
 ext_maintenance_events:['patent_number','event_date','event_code','entity_type','source_id'],
 ext_patent_paper_links:['patent_number','work_id','confidence','reference_type','self_citation','where_found','source_id'],
 ext_papers:['work_id','doi','title','year','venue','type','cited_by_count','primary_topic','topics','retrieved_at','source_id'],
 external_source_seeds:['source_id','patent_number','purpose'],
} as const;
export type ExternalTable=keyof typeof columns;
const keys:Record<ExternalTable,string[]>={external_sources:['id'],ext_patents:['patent_number','source_id'],ext_patent_citations:['citing_patent','cited_patent','category','purpose','source_id'],ext_maintenance_events:['patent_number','event_date','event_code','entity_type','source_id'],ext_patent_paper_links:['patent_number','work_id','reference_type','where_found','source_id'],ext_papers:['work_id','source_id'],external_source_seeds:['source_id','patent_number','purpose']};
const json=new Set(['cpc','assignees','assignee_countries','primary_topic','topics','notes']);
/** Deliberately separate from the runtime reader; database RLS is the write boundary. */
export async function upsertExternal(pool:Pool,table:ExternalTable,rows:Record<string,unknown>[]){
 if(currentAccess())throw new Error('External data writes require a maintenance connection');
 const fields=columns[table],key=keys[table];
 for(let offset=0;offset<rows.length;offset+=100){
  const batch=rows.slice(offset,offset+100),params:unknown[]=[];
  const tuples=batch.map(row=>'('+fields.map(name=>{params.push(json.has(name)&&row[name]!=null?JSON.stringify(row[name]):row[name]??null);return '$'+params.length;}).join(',')+')');
  const update=fields.filter(f=>!key.includes(f)).map(f=>`${f}=EXCLUDED.${f}`).join(',');
  // Duplicate source rows within a batch are valid; conflict handling occurs per key.
  const unique=new Map(batch.map(row=>[JSON.stringify(key.map(k=>row[k])),row]));
  if(unique.size!==batch.length){await upsertExternal(pool,table,[...unique.values()]);continue;}
  await connection(pool).query(`INSERT INTO ${table}(${fields.join(',')}) VALUES ${tuples.join(',')} ON CONFLICT(${key.join(',')}) DO ${update?'UPDATE SET '+update:'NOTHING'}`,params);
 }
}
export class ExternalReferenceReader{
 constructor(private readonly pool:Pool){}
 async datasetNumbers(datasetId:string){
  const db=connection(this.pool),found=await db.query('SELECT id FROM datasets WHERE id=$1',[datasetId]);
  if(!found.rowCount)throw new Error('数据集不存在或没有读取权限');
  return (await db.query<{id:string}>('SELECT id FROM patents WHERE dataset_id=$1 ORDER BY id',[datasetId])).rows.map(r=>patentNumber(r.id));
 }
 async coverage(datasetId:string){return transaction(this.pool,async()=>{
  const numbers=await this.datasetNumbers(datasetId),ids=[...new Set(numbers.map(n=>n.canonical))],db=connection(this.pool);
  const counts=await db.query(`SELECT
   (SELECT count(DISTINCT patent_number)::int FROM ext_patents WHERE patent_number=ANY($1)) bibliographic,
   (SELECT count(DISTINCT cited_patent)::int FROM ext_patent_citations WHERE purpose='D1' AND cited_patent=ANY($1)) forward_citations,
   (SELECT count(DISTINCT patent_number)::int FROM ext_maintenance_events WHERE patent_number=ANY($1)) maintenance,
   (SELECT count(DISTINCT patent_number)::int FROM ext_patent_paper_links WHERE patent_number=ANY($1)) paper_links`,[ids]);
  const scans=(await db.query('SELECT purpose,count(DISTINCT patent_number)::int AS patents FROM external_source_seeds WHERE patent_number=ANY($1) GROUP BY purpose',[ids])).rows;
  const sources=(await db.query('SELECT s.* FROM external_sources s WHERE EXISTS(SELECT 1 FROM external_source_seeds x WHERE x.source_id=s.id AND x.patent_number=ANY($1)) OR EXISTS(SELECT 1 FROM ext_patents x WHERE x.source_id=s.id AND x.patent_number=ANY($1)) OR EXISTS(SELECT 1 FROM ext_patent_citations x WHERE x.source_id=s.id AND x.cited_patent=ANY($1)) OR EXISTS(SELECT 1 FROM ext_maintenance_events x WHERE x.source_id=s.id AND x.patent_number=ANY($1)) OR EXISTS(SELECT 1 FROM ext_patent_paper_links x WHERE x.source_id=s.id AND x.patent_number=ANY($1)) ORDER BY s.name,s.version',[ids])).rows;
  return {datasetId,total:numbers.length,uniqueNumbers:ids.length,grants:numbers.filter(n=>n.recognized&&n.type!=='application').length,unrecognized:numbers.filter(n=>!n.recognized).length,covered:counts.rows[0],completedScans:scans,sources,warnings:['覆盖件数表示观测到记录；零引用、未扫描和时间截断需要结合 completedScans 与来源版本区分。','申请公开件、外观设计和植物专利没有维持费义务；事件不直接代表当前法律状态。','科学链接来自 CC BY-NC 4.0 数据，限非商业使用。']};
 },{repeatableRead:true,readOnly:true});}
 async sources(){return (await connection(this.pool).query('SELECT * FROM external_sources ORDER BY name,version')).rows;}
 async patents(ids:string[]){return (await connection(this.pool).query('SELECT *,application_date::text AS application_date,grant_date::text AS grant_date FROM ext_patents WHERE patent_number=ANY($1)',[ids.map(normalizePatentNumber)])).rows;}
 async citations(ids:string[],direction:'forward'|'backward'='forward',offset=0){return (await connection(this.pool).query(`SELECT * FROM ext_patent_citations WHERE ${direction==='forward'?'cited_patent':'citing_patent'}=ANY($1) ORDER BY citing_patent,cited_patent,category,purpose,source_id LIMIT 1000 OFFSET $2`,[ids.map(normalizePatentNumber),offset])).rows;}
 async maintenance(ids:string[],offset=0){return (await connection(this.pool).query('SELECT *,event_date::text AS event_date FROM ext_maintenance_events WHERE patent_number=ANY($1) ORDER BY patent_number,event_date,event_code,entity_type,source_id LIMIT 1000 OFFSET $2',[ids.map(normalizePatentNumber),offset])).rows;}
 async paperLinks(ids:string[],offset=0){return (await connection(this.pool).query('SELECT * FROM ext_patent_paper_links WHERE patent_number=ANY($1) ORDER BY patent_number,work_id,reference_type,where_found,source_id LIMIT 1000 OFFSET $2',[ids.map(normalizePatentNumber),offset])).rows;}
 async papers(ids:string[]){return (await connection(this.pool).query('SELECT * FROM ext_papers WHERE work_id=ANY($1)',[ids])).rows;}
}
