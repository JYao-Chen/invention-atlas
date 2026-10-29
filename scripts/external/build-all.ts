import {writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {options,discover,testDatabase,seedNumbers,saveReport,type Discovery,type Options} from './common';
import {runners,rules,type SourceName} from './sources';
export async function main(sources:SourceName[]=Object.keys(runners) as SourceName[],opts:Options=options()){
 const started=Date.now(),probes:Discovery[]=[];
 // Metadata only; never fetch a raw bulk file during dry-run.
 for(const source of sources){try{probes.push(await discover(source,opts));}catch(e){probes.push({source,version:'unresolved',url:'',license:'unresolved',files:[],blocked:(e as Error).message});}}
 if(opts.dryRun){const report={dryRun:true,seedLimit:opts.limit??null,sources:probes,storageLimitBytes:3_000_000_000,temporaryLimitBytes:4_000_000_000,rawFilesRetained:0,estimate:'Subset size and full-run duration require corpus seeds and authenticated ODP file metadata; no full-data estimate is asserted.',elapsedMs:Date.now()-started};await mkdir(resolve(opts.output),{recursive:true});await saveReport(opts.output,resolve(opts.output,'probe.json'),report);console.log(JSON.stringify(report,null,2));return;}
 const db=await testDatabase(opts);
 try{
  const seeds=await seedNumbers(db.pool,opts),ids=seeds.map(n=>n.raw),reports=[];
  for(const d of probes){
   const name=d.source as SourceName;
   if(!ids.length||d.blocked){const {Build}=await import('./common');const build=await Build.open(db.pool,opts,d,ids,rules[name]);await build.blocked(d.blocked??'No corpus seeds in this isolated test schema; provide --seeds corpus-numbers.json');reports.push(build.manifest);continue;}
   try{reports.push(await runners[name](db.pool,opts,d,ids));}catch(e){const {Build}=await import('./common');const build=await Build.open(db.pool,opts,d,ids,rules[name]);await build.blocked((e as Error).message);reports.push(build.manifest);}
  }
  const tables=['external_sources','ext_patents','ext_patent_citations','ext_maintenance_events','ext_patent_paper_links','ext_papers','external_source_seeds'],counts:Record<string,number>={};
  for(const table of tables)counts[table]=(await db.pool.query('SELECT count(*)::int n FROM '+table)).rows[0].n;
  const result={seedCount:ids.length,schema:db.schema,schemaRetained:Boolean(opts.schema),reports,counts,subsetBytes:reports.reduce((n,m)=>n+Object.values(m.files).reduce((s,f)=>s+f.bytes,0),0),openAlexRequests:reports.filter(m=>m.source==='openalex').reduce((n,m)=>n+m.requests,0),elapsedMs:Date.now()-started};
  await saveReport(opts.output,resolve(opts.output,'summary.json'),result);console.log(JSON.stringify(result,null,2));
  if(reports.some(m=>m.status!=='complete'))process.exitCode=2;
 }finally{await db.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(e=>{console.error((e as Error).message);process.exitCode=1;});
