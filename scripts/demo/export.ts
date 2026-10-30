import {mkdir,writeFile,stat} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {resolve} from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createGzip} from 'node:zlib';
import {Pool} from 'pg';
import {VERSION,externalTables,type Entry,type Header} from './bundle';
import type {Dataset,Patent} from '../../src/lib/types';
import {resultCopy,resultText} from '../../src/lib/result-copy';
// Export is deliberately table/field-specific: users, settings, reports and history are never read.
const output=resolve(process.argv[2]||'artifacts/demo/'+VERSION);
if(!process.env.DEMO_EXPORT_DATABASE_URL)throw new Error('需要只读来源连接 DEMO_EXPORT_DATABASE_URL');
const pool=new Pool({connectionString:process.env.DEMO_EXPORT_DATABASE_URL});await mkdir(output,{recursive:true});
const patentFields=['id','title','abstract','applicants','assignees','inventors','publicationDate','filingDate','ipc','cpc','claims','description','citations','familyId','familyMembers','legalStatus','legalAsOf','sourceUrl','sourceName','rawText','locations','embedding','publicEvidence'] as const;
const datasetIds=['40cacb89-7f68-4c9c-9463-4c4b9c0b7bf2','c5426e94-6012-4f18-ae2b-055bfdcad8bf','f451f0d2-69d0-4b3f-8335-8efb28b0655b'];
const defaultDatasetId=datasetIds[2],embedding={model:'text-embedding-v4',dimensions:1024,input:'title + newline + abstract'};
try{
 const client=await pool.connect();
 try{
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const datasets:Dataset[]=(await client.query('SELECT payload FROM datasets WHERE id=ANY($1) ORDER BY position',[datasetIds])).rows.map(r=>({...r.payload,sampling:resultText(r.payload.sampling),warnings:r.payload.warnings.map(resultText).filter(Boolean)}));
  if(datasets.length!==3)throw new Error('固定版本需要三个来源数据集');
  const counts={datasets:datasets.length,patents:datasets.reduce((n,d)=>n+d.count,0),examples:2};
  async function* core():AsyncGenerator<Entry>{
   yield {kind:'header',version:VERSION,part:'core',counts,defaultDatasetId,embedding};
   const main:Patent[]=[];
   for(const meta of datasets){
    yield {kind:'dataset',value:meta};let last='';
    while(true){
     const batch=(await client.query('SELECT payload FROM patents WHERE dataset_id=$1 AND id>$2 ORDER BY id LIMIT 50',[meta.id,last])).rows;
     if(!batch.length)break;
     for(const {payload} of batch){const patent=Object.fromEntries(patentFields.filter(k=>payload[k]!==undefined).map(k=>[k,payload[k]])) as Patent;yield {kind:'patent',datasetId:meta.id,value:patent};if(meta.id===defaultDatasetId)main.push({...patent,rawText:'',description:'',locations:{}});last=patent.id;}
    }
   }
   process.env.DATABASE_URL=process.env.DEMO_EXPORT_DATABASE_URL;
   const {executeTool}=await import('../../src/server/tools');
   for(const tool of ['analyze_patent_trend','analyze_yearly_keywords']){
    const result=resultCopy(await executeTool(tool,tool==='analyze_patent_trend'?{frequency:'year'}:{top_k:10},datasets.find(d=>d.id===defaultDatasetId)!,main,{semantic:false}));
    result.id=VERSION+'-'+tool;
    const title='演示 · '+result.title;
    const answer='# '+result.title+'\n\n'+result.summary+'\n\n[[chart:'+result.id+']]\n\n'+result.method;
    yield {kind:'example',title,answer,result};
   }
  }
  await pipeline(Readable.from(core()).map(e=>JSON.stringify(e)+'\n'),createGzip(),createWriteStream(resolve(output,'core.jsonl.gz')));
  const externalCounts:Record<string,number>={};
  for(const table of externalTables)externalCounts[table]=Number((await client.query('SELECT count(*) AS n FROM '+table)).rows[0].n);
  async function* papers():AsyncGenerator<Entry>{
   yield {kind:'header',version:VERSION,part:'papers',counts:externalCounts,defaultDatasetId,embedding};
   for(const table of externalTables){
    await client.query('DECLARE demo_export_cursor NO SCROLL CURSOR FOR SELECT * FROM '+table);
    while(true){const rows=(await client.query('FETCH 100 FROM demo_export_cursor')).rows;if(!rows.length)break;
     for(const row of rows){if(table==='external_sources')row.notes={demoVersion:VERSION};yield {kind:'external',table,value:row};}
    }
    await client.query('CLOSE demo_export_cursor');
   }
  }
  await pipeline(Readable.from(papers()).map(e=>JSON.stringify(e)+'\n'),createGzip(),createWriteStream(resolve(output,'papers.jsonl.gz')));
  const files=[];for(const part of ['core','papers'])files.push({name:part+'.jsonl.gz',bytes:(await stat(resolve(output,part+'.jsonl.gz'))).size});
  const manifest={version:VERSION,createdAt:new Date().toISOString(),datasets:datasets.map(({id,name,count,years,indexed})=>({id,name,count,years,indexed})),counts,externalCounts,embedding,files,sources:[{name:'DLT-Patents',url:'https://huggingface.co/datasets/ExponentialScience/DLT-Patents',license:'Publisher describes USPTO patent text as public domain; retain attribution',citation:'Hernandez et al., DLT-Corpus, arXiv:2602.22045'},{name:'Google Patents',url:'https://patents.google.com',content:'Public bibliographic, family and legal-event facts already attached to 35 records; retrieval dates retained'},{name:'Reliance on Science',url:'https://zenodo.org/records/22967630',license:'CC BY-NC 4.0',authors:'Matt Marx and Aaron Fuegi',citations:['https://doi.org/10.1111/jems.12455','https://doi.org/10.1002/smj.3145']},{name:'OpenAlex',url:'https://openalex.org',license:'CC0',content:'Metadata only'}]};
  await writeFile(resolve(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  await client.query('COMMIT');console.log(JSON.stringify(manifest,null,2));
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}finally{await pool.end();const state=globalThis as unknown as {patentPool?:Pool};if(state.patentPool)await state.patentPool.end();}
