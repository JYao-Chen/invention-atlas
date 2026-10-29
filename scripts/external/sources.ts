import {createInterface} from 'node:readline';
import {Readable} from 'node:stream';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import type {Pool} from 'pg';
import {records,maintenanceLine,patentRecord,paperLink,isoDate,openAlexPaper,workId} from '../../src/server/external/parsers';
import {normalizePatentNumber,patentNumber} from '../../src/server/external/patent-number';
import {Build,discover,download,fileFor,type Options,type Discovery,type Action} from './common';
export const rules={patentsview:'D1: all citation pairs whose cited grant is in corpus; D2: all backward citations of D1 citing patents (CD index only); D1′: corpus grants and D1 citing patent dates/CPC/assignees/countries/claim counts.',maintenance:'D3: all maintenance events for corpus grants and D1 citing grants; no legal-status inference.',science:'D4: pcs_oa_uspto.csv rows whose normalized patent belongs to corpus; all confidence levels and reference/wherefound/self-citation flags retained.',openalex:'D5: distinct work IDs linked to selected corpus seeds by D4; <=50 IDs per request; CC0 metadata only.'};
export type SourceName=keyof typeof rules;
export async function patentsview(pool:Pool,o:Options,d:Discovery,ids:string[]){
 const grants=ids.filter(id=>{const n=patentNumber(id);return n.recognized&&n.type!=='application';}).map(normalizePatentNumber),seed=new Set(grants);
 const build=await Build.open(pool,o,d,ids,rules.patentsview);if(d.blocked){await build.blocked(d.blocked);return build.manifest;}
 const citing=new Set<string>();
 await build.stage('forward',async function*(){for await(const row of records(download(fileFor(d,'g_us_patent_citation'),o.fixtureDir),'\t',['patent_id','citation_patent_id'])){
  const cited=normalizePatentNumber(row.citation_patent_id);if(!seed.has(cited))continue;
  yield {table:'ext_patent_citations',row:{citing_patent:build.normalizer.normalize(row.patent_id),cited_patent:cited,category:row.citation_category??'',purpose:'D1'}};
 }},a=>{citing.add(a.row.citing_patent as string);});
 await build.stage('second-order',async function*(){for await(const row of records(download(fileFor(d,'g_us_patent_citation'),o.fixtureDir),'\t',['patent_id','citation_patent_id'])){
  const from=normalizePatentNumber(row.patent_id);if(!citing.has(from))continue;
  yield {table:'ext_patent_citations',row:{citing_patent:from,cited_patent:build.normalizer.normalize(row.citation_patent_id),category:row.citation_category??'',purpose:'D2'}};
 }});
 for(const [stem,numberColumn,countryColumn]of [['g_us_application_citation','citation_document_number',null],['g_foreign_citation','citation_application_id','citation_country']] as const){
  await build.stage(stem,async function*(){for await(const row of records(download(fileFor(d,stem),o.fixtureDir),'\t',['patent_id',numberColumn,...(countryColumn?[countryColumn]:[])])){
   const from=normalizePatentNumber(row.patent_id);if(!citing.has(from))continue;
   const raw=countryColumn?row[countryColumn]+row[numberColumn]:row[numberColumn];
   yield {table:'ext_patent_citations',row:{citing_patent:from,cited_patent:build.normalizer.normalize(raw),category:row.citation_category??'',purpose:'D2'}};
  }});
 }
 const targets=new Set([...grants,...citing]);
 await build.stage('bibliography',async function*(){
  const patents=new Map<string,ReturnType<typeof patentRecord>>();
  for await(const row of records(download(fileFor(d,'g_patent'),o.fixtureDir),'\t',['patent_id','patent_date','num_claims'])){
   const id=normalizePatentNumber(row.patent_id);if(targets.has(id))patents.set(id,patentRecord(row,build.normalizer));
  }
  for await(const row of records(download(fileFor(d,'g_application'),o.fixtureDir),'\t',['patent_id','filing_date'])){
   const p=patents.get(normalizePatentNumber(row.patent_id));if(p)p.application_date=isoDate(row.filing_date);
  }
  for await(const row of records(download(fileFor(d,'g_cpc_current'),o.fixtureDir),'\t',['patent_id','cpc_group'])){
   const p=patents.get(normalizePatentNumber(row.patent_id));if(p&&row.cpc_group&&!p.cpc.includes(row.cpc_group))p.cpc.push(row.cpc_group);
  }
  const locations=new Map<string,Set<string>>();
  for await(const row of records(download(fileFor(d,'g_assignee_disambiguated'),o.fixtureDir),'\t',['patent_id','disambig_assignee_organization','location_id'])){
   const id=normalizePatentNumber(row.patent_id),p=patents.get(id);if(!p)continue;
   const name=row.disambig_assignee_organization||[row.disambig_assignee_individual_name_first,row.disambig_assignee_individual_name_last].filter(Boolean).join(' ');
   if(name&&!p.assignees.includes(name))p.assignees.push(name);
   if(row.location_id){const linked=locations.get(row.location_id)??new Set<string>();linked.add(id);locations.set(row.location_id,linked);}
  }
  for await(const row of records(download(fileFor(d,'g_location_disambiguated'),o.fixtureDir),'\t',['location_id','disambig_country'])){
   for(const id of locations.get(row.location_id)??[]){const p=patents.get(id)!;if(row.disambig_country&&!p.assignee_countries.includes(row.disambig_country))p.assignee_countries.push(row.disambig_country);}
  }
  for(const row of patents.values())yield {table:'ext_patents',row};
 });
 await build.finish({D1:grants,D2:[...citing],"D1′":grants});return build.manifest;
}
export async function maintenance(pool:Pool,o:Options,d:Discovery,ids:string[]){
 const grants=ids.map(normalizePatentNumber).filter(id=>{const n=patentNumber(id);return n.recognized&&n.type!=='application';});
 const related=(await pool.query("SELECT DISTINCT citing_patent FROM ext_patent_citations WHERE purpose='D1' AND cited_patent=ANY($1)",[grants])).rows.map(r=>r.citing_patent as string);
 const targets=new Set([...grants,...related]),build=await Build.open(pool,o,d,ids,rules.maintenance);
 if(d.blocked){await build.blocked(d.blocked);return build.manifest;}
 const hasD1=await pool.query("SELECT count(DISTINCT patent_number)::int n FROM external_source_seeds WHERE purpose='D1' AND patent_number=ANY($1)",[grants]);
 if(hasD1.rows[0].n!==grants.length){await build.blocked('D1 must complete before D3 so that citing patents are included');return build.manifest;}
 await build.inputs([...targets].sort());
 // ptmnfee2 contains cumulative weekly event files: use the latest snapshot, not all older copies.
 const files=d.files.filter(f=>/\.(zip|gz|txt)$/i.test(f.name)&&!/desc|documentation|readme/i.test(f.name)).sort((a,b)=>(a.updated??a.name).localeCompare(b.updated??b.name));
 const file=files.at(-1);if(!file)throw new Error('ptmnfee2 metadata has no event archive');
 await build.stage('events',async function*(){for await(const line of createInterface({input:Readable.from(download(file,o.fixtureDir,/(?:^|\/)MaintFeeEvents_\d{8}\.txt$/i)),crlfDelay:Infinity})){
  if(!line.trim())continue;const row=maintenanceLine(line,build.normalizer);if(targets.has(row.patent_number))yield {table:'ext_maintenance_events',row};
 }});
 await build.finish({D3:[...targets]});return build.manifest;
}
export async function science(pool:Pool,o:Options,d:Discovery,ids:string[]){
 const seeds=new Set(ids.map(normalizePatentNumber)),build=await Build.open(pool,o,d,ids,rules.science);
 await build.stage('links',async function*(){for await(const row of records(download(d.files[0],o.fixtureDir),',',['reftype','confscore','oaid','patent','wherefound'])){
  if(seeds.has(normalizePatentNumber(row.patent)))yield {table:'ext_patent_paper_links',row:paperLink(row,build.normalizer)};
 }});
 await build.finish({D4:[...seeds]});return build.manifest;
}
export async function openalex(pool:Pool,o:Options,d:Discovery,ids:string[]){
 const build=await Build.open(pool,o,d,ids,rules.openalex),seeds=ids.map(normalizePatentNumber);
 const links=(await pool.query('SELECT DISTINCT work_id FROM ext_patent_paper_links WHERE patent_number=ANY($1) ORDER BY work_id',[seeds])).rows.map(r=>r.work_id as string);
 const scans=await pool.query("SELECT count(DISTINCT patent_number)::int n FROM external_source_seeds WHERE purpose='D4' AND patent_number=ANY($1)",[seeds]);
 if(scans.rows[0].n!==new Set(seeds).size){await build.blocked('D4 has not completed for all selected corpus seeds');return build.manifest;}
 await build.inputs(links);
 for(let i=0;i<links.length;i+=50){
  const batch=links.slice(i,i+50);let stopped:string|undefined;
  await build.stage('works-'+i,async function*(){
   let data:{results:Record<string,any>[]};
   if(o.fixtureDir)data=JSON.parse(await readFile(resolve(o.fixtureDir,'openalex.json'),'utf8'));
   else{
    const url=new URL('https://api.openalex.org/works');url.searchParams.set('filter','openalex_id:'+batch.join('|'));url.searchParams.set('per-page','50');
    if(process.env.OPENALEX_API_KEY)url.searchParams.set('api_key',process.env.OPENALEX_API_KEY);
    if(process.env.OPENALEX_MAILTO)url.searchParams.set('mailto',process.env.OPENALEX_MAILTO);
    // Sequential at 1 request/second, including keyed access. No retries against an exhausted budget.
    await new Promise(ok=>setTimeout(ok,1000));build.manifest.requests++;await build.save();
    const response=await fetch(url,{headers:{'User-Agent':'invention-atlas-external/1.0'},signal:AbortSignal.timeout(60000)});
    if([401,402,403,429].includes(response.status)){stopped='OpenAlex HTTP '+response.status+'; batch '+i+' remains pending. Resume the same command after quota/access recovers.';throw new Error(stopped);}
    if(!response.ok)throw new Error('OpenAlex HTTP '+response.status);
    data=await response.json();
    if(response.headers.get('X-RateLimit-Remaining')==='0')stopped='OpenAlex quota exhausted after saved batch '+i;
   }
   if(!Array.isArray(data.results))throw new Error('OpenAlex response lacks results');
   const wanted=new Set(batch),found=new Set<string>();
   for(const work of data.results){const id=workId(work.id);if(wanted.has(id)){found.add(id);yield {table:'ext_papers',row:openAlexPaper(work,new Date().toISOString())};}}
   build.manifest.missingWorks=[...new Set([...(build.manifest.missingWorks??[]),...batch.filter(id=>!found.has(id))])];await build.save();
  });
  if(stopped){await build.blocked(stopped);return build.manifest;}
 }
 await build.finish({D5:seeds});return build.manifest;
}
export const runners={patentsview,maintenance,science,openalex};
