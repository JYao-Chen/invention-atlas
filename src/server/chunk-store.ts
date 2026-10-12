import type {Pool} from 'pg';
import {isDeepStrictEqual} from 'node:util';
import type {Patent} from '../lib/types';
import {connection,transaction} from './postgres';
import {chunkPatent,type ChunkOptions,type PatentChunk} from './patent-chunks';

export type ChunkHit={chunk:PatentChunk;score:number;matches:('keyword'|'semantic')[];similarity?:number;keywordRank?:number;semanticRank?:number};
const sameText="d.source_fields->'abstract'=p.payload->'abstract' AND d.source_fields->'description'=p.payload->'description' AND d.source_fields->'claims'=p.payload->'claims'";
const currentDocument=`EXISTS(SELECT 1 FROM patent_documents d JOIN patents p ON p.dataset_id=d.dataset_id AND p.id=d.patent_id WHERE d.dataset_id=c.dataset_id AND d.patent_id=c.patent_id AND d.version=c.document_version AND ${sameText})`;
export function fuseChunkHits(keyword:{chunk:PatentChunk;rank:number}[],semantic:{chunk:PatentChunk;similarity:number}[],limit=20):ChunkHit[]{
 const hits=new Map<string,ChunkHit>();
 for(const [kind,items] of [['keyword',keyword],['semantic',semantic]] as const){
  items.forEach((item,index)=>{
   const chunk=item.chunk,key=JSON.stringify([chunk.patentId,chunk.documentVersion,chunk.ordinal]);
   const hit=hits.get(key)||{chunk,score:0,matches:[]};
   hit.score+=1/(60+index+1);hit.matches.push(kind);
   if(kind==='keyword')hit.keywordRank=index+1;else{hit.semanticRank=index+1;hit.similarity=(item as {similarity:number}).similarity;}
   hits.set(key,hit);
  });
 }
 return [...hits.values()].sort((a,b)=>b.score-a.score||a.chunk.patentId.localeCompare(b.chunk.patentId)||a.chunk.ordinal-b.chunk.ordinal).slice(0,limit);
}

export class ChunkStore{
 constructor(private readonly pool:Pool){}
 async alignment(datasetId:string,version:string,patentIds?:string[]){
  const row=(await connection(this.pool).query(`SELECT count(*)::int AS documents,count(*) FILTER(WHERE p.id IS NOT NULL AND ${sameText})::int AS current,count(*) FILTER(WHERE p.id IS NOT NULL AND NOT(${sameText}))::int AS changed,count(*) FILTER(WHERE p.id IS NULL)::int AS removed FROM patent_documents d LEFT JOIN patents p ON p.dataset_id=d.dataset_id AND p.id=d.patent_id WHERE d.dataset_id=$1 AND d.version=$2 AND ($3::text[] IS NULL OR d.patent_id=ANY($3))`,[datasetId,version,patentIds??null])).rows[0];
  return row as {documents:number;current:number;changed:number;removed:number};
 }
 async versions(datasetId:string,model:string,dimensions:number){
  return (await connection(this.pool).query('SELECT c.document_version AS version,count(*)::int AS total,count(e.ordinal)::int AS done FROM patent_chunks c LEFT JOIN chunk_embeddings e ON e.dataset_id=c.dataset_id AND e.patent_id=c.patent_id AND e.document_version=c.document_version AND e.ordinal=c.ordinal AND e.model=$2 AND e.dimensions=$3 WHERE c.dataset_id=$1 GROUP BY c.document_version ORDER BY c.document_version',[datasetId,model,dimensions])).rows as {version:string;total:number;done:number}[];
 }

 async source(datasetId:string,patentId:string,version:string,ordinal:number){
  const row=(await connection(this.pool).query('SELECT c.payload AS chunk,d.source_fields AS fields,d.source_url AS "sourceUrl",d.source_name AS "sourceName" FROM patent_chunks c JOIN patent_documents d ON d.dataset_id=c.dataset_id AND d.patent_id=c.patent_id AND d.version=c.document_version WHERE c.dataset_id=$1 AND c.patent_id=$2 AND c.document_version=$3 AND c.ordinal=$4',[datasetId,patentId,version,ordinal])).rows[0];
  if(!row)return undefined;
  const chunk:PatentChunk=row.chunk;
  const text=chunk.section==='claim'?row.fields.claims.find((claim:{number:number})=>claim.number===chunk.claimNumber)?.text:row.fields[chunk.section];
  if(typeof text!=='string'||text.slice(chunk.start,chunk.end)!==chunk.text)throw new Error('保存的原文片段与版本内容不一致');
  return {chunk,sourceText:text,sourceUrl:row.sourceUrl as string,sourceName:row.sourceName as string,offsetUnit:'utf16-code-unit'};
 }
 async saveDocument(datasetId:string,patent:Patent,version:string,options:Partial<ChunkOptions>={}){
  const chunks=chunkPatent(patent,version,options);
  const fields={abstract:patent.abstract,description:patent.description,claims:patent.claims,rawText:patent.rawText,locations:patent.locations};
  return transaction(this.pool,async client=>{
   const inserted=await client.query('INSERT INTO patent_documents(dataset_id,patent_id,version,source_url,source_name,source_fields) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING version',[datasetId,patent.id,version,patent.sourceUrl,patent.sourceName,fields]);
   if(!inserted.rowCount){
    const saved=(await client.query('SELECT source_fields,source_url,source_name FROM patent_documents WHERE dataset_id=$1 AND patent_id=$2 AND version=$3',[datasetId,patent.id,version])).rows[0];
    const previous=(await client.query('SELECT payload FROM patent_chunks WHERE dataset_id=$1 AND patent_id=$2 AND document_version=$3 ORDER BY ordinal',[datasetId,patent.id,version])).rows.map(row=>row.payload);
    if(!saved||!isDeepStrictEqual(saved.source_fields,JSON.parse(JSON.stringify(fields)))||saved.source_url!==patent.sourceUrl||saved.source_name!==patent.sourceName||!isDeepStrictEqual(previous,JSON.parse(JSON.stringify(chunks))))throw new Error('原文版本已存在且内容或分段参数不同，请使用新版本');
    return {chunks:previous.length,reused:true};
   }
   if(chunks.length)await client.query("INSERT INTO patent_chunks(dataset_id,patent_id,document_version,ordinal,section,source_start,source_end,text,payload) SELECT $1,$2,$3,(chunk->>'ordinal')::int,chunk->>'section',(chunk->>'start')::int,(chunk->>'end')::int,chunk->>'text',chunk FROM jsonb_array_elements($4::jsonb) chunk",[datasetId,patent.id,version,JSON.stringify(chunks)]);
   return {chunks:chunks.length,reused:false};
  });
 }

 async pending(datasetId:string,version:string,model:string,dimensions:number,limit=100,patentIds?:string[],after?:{patentId:string;ordinal:number}):Promise<PatentChunk[]>{
  return (await connection(this.pool).query('SELECT c.payload FROM patent_chunks c WHERE c.dataset_id=$1 AND c.document_version=$2 AND ($6::text[] IS NULL OR c.patent_id=ANY($6)) AND ($7::text IS NULL OR (c.patent_id,c.ordinal)>($7,$8::int)) AND NOT EXISTS(SELECT 1 FROM chunk_embeddings e WHERE e.dataset_id=c.dataset_id AND e.patent_id=c.patent_id AND e.document_version=c.document_version AND e.ordinal=c.ordinal AND e.model=$3 AND e.dimensions=$4) ORDER BY c.patent_id,c.ordinal LIMIT $5',[datasetId,version,model,dimensions,Math.min(1000,Math.max(1,limit)),patentIds??null,after?.patentId??null,after?.ordinal??null])).rows.map(row=>row.payload);
 }

 async progress(datasetId:string,version:string,model:string,dimensions:number,patentIds?:string[]){
  const row=(await connection(this.pool).query('SELECT count(*)::int AS total,count(e.ordinal)::int AS done FROM patent_chunks c LEFT JOIN chunk_embeddings e ON e.dataset_id=c.dataset_id AND e.patent_id=c.patent_id AND e.document_version=c.document_version AND e.ordinal=c.ordinal AND e.model=$3 AND e.dimensions=$4 WHERE c.dataset_id=$1 AND c.document_version=$2 AND ($5::text[] IS NULL OR c.patent_id=ANY($5))',[datasetId,version,model,dimensions,patentIds??null])).rows[0];
  return row as {total:number;done:number};
 }

 async saveEmbeddings(datasetId:string,model:string,dimensions:number,items:{chunk:PatentChunk;embedding:number[]}[]){
  if(!model.trim()||!Number.isInteger(dimensions)||dimensions<1)throw new Error('必须声明嵌入模型和维度');
  for(const item of items)if(item.embedding.length!==dimensions||item.embedding.some(value=>!Number.isFinite(value))||!item.embedding.some(value=>value!==0))throw new Error('向量维度无效或包含无效数值');
  if(!items.length)return 0;
  return transaction(this.pool,async client=>{
   const inserted=await client.query("INSERT INTO chunk_embeddings(dataset_id,patent_id,document_version,ordinal,model,dimensions,embedding) SELECT $1,item->'chunk'->>'patentId',item->'chunk'->>'documentVersion',(item->'chunk'->>'ordinal')::int,$2,$3,(item->'embedding')::text::public.vector FROM jsonb_array_elements($4::jsonb) item ON CONFLICT DO NOTHING RETURNING ordinal",[datasetId,model,dimensions,JSON.stringify(items)]);
   return inserted.rowCount||0;
  });
 }

 async semantic(datasetId:string,version:string,model:string,embedding:number[],limit=20,patentIds?:string[],currentOnly=false){
  if(!embedding.length||embedding.some(value=>!Number.isFinite(value))||!embedding.some(value=>value!==0))throw new Error('查询向量无效');
  if(patentIds?.length===0)return [];
  return (await connection(this.pool).query(`SELECT c.payload AS chunk,1-(e.embedding <=> $5::public.vector) AS similarity FROM chunk_embeddings e JOIN patent_chunks c USING(dataset_id,patent_id,document_version,ordinal) WHERE e.dataset_id=$1 AND e.document_version=$2 AND e.model=$3 AND e.dimensions=$4 AND ($7::text[] IS NULL OR e.patent_id=ANY($7)) AND (NOT $8::boolean OR ${currentDocument}) ORDER BY e.embedding <=> $5::public.vector,e.patent_id,e.ordinal LIMIT $6`,[datasetId,version,model,embedding.length,JSON.stringify(embedding),Math.min(100,Math.max(1,limit)),patentIds??null,currentOnly])).rows as {chunk:PatentChunk;similarity:number}[];
 }

 async keyword(datasetId:string,version:string,query:string,limit=20,patentIds?:string[],currentOnly=false){
  const terms=[...new Set(query.trim().toLowerCase().split(/\s+/).filter(Boolean))];
  if(!terms.length||patentIds?.length===0)return [];
  // Literal phrase terms support Chinese without claiming linguistic tokenization.
  return (await connection(this.pool).query(`SELECT c.payload AS chunk,(SELECT count(*)::int FROM unnest($3::text[]) term WHERE strpos(lower(c.text),term)>0) AS rank FROM patent_chunks c WHERE c.dataset_id=$1 AND c.document_version=$2 AND ($5::text[] IS NULL OR c.patent_id=ANY($5)) AND (NOT $6::boolean OR ${currentDocument}) AND EXISTS(SELECT 1 FROM unnest($3::text[]) term WHERE strpos(lower(c.text),term)>0) ORDER BY rank DESC,c.patent_id,c.ordinal LIMIT $4`,[datasetId,version,terms,Math.min(100,Math.max(1,limit)),patentIds??null,currentOnly])).rows as {chunk:PatentChunk;rank:number}[];
 }

 async hybrid(datasetId:string,version:string,query:string,model:string,embedding:number[],limit=20,patentIds?:string[],currentOnly=false){
  const bounded=Math.min(100,Math.max(1,Math.floor(limit)));
  const [keyword,semantic]=await Promise.all([this.keyword(datasetId,version,query,100,patentIds,currentOnly),this.semantic(datasetId,version,model,embedding,100,patentIds,currentOnly)]);
  return {hits:fuseChunkHits(keyword,semantic,bounded),method:'reciprocal-rank-fusion',keywordMethod:'literal-space-separated-terms',candidateLimit:100,keywordCandidates:keyword.length,semanticCandidates:semantic.length};
 }
}
