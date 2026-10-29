import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {patentNumber,normalizePatentNumber,toPatentsView,toRelianceOnScience,toMaintenance,NumberNormalizer} from '../src/server/external/patent-number';
import {records,delimited,paperLink,maintenanceLine,openAlexPaper,isoDate} from '../src/server/external/parsers';
import {postgresPool,withAccess,migratePostgres} from '../src/server/postgres';
import {upsertExternal,ExternalReferenceReader} from '../src/server/external/store';
import {options,discover,download} from '../scripts/external/common';
import {main} from '../scripts/external/build-all';
const fixture=resolve('tests/fixtures/external');
async function* chunks(s:string){for(const byte of Buffer.from(s))yield Buffer.from([byte]);}
async function collect<T>(it:AsyncIterable<T>){const rows:T[]=[];for await(const row of it)rows.push(row);return rows;}

test('external US patent numbering preserves publication/grant distinctions and round-trips source formats',()=>{
 const cases:[string,string,string][]=[['US10095888B1','US10095888','utility'],['010095888','US10095888','utility'],['US006871823A','US6871823','utility'],['us-2015133390-a1','US20150133390','application'],['US2008/0229119 A1','US20080229119','application'],['20080229119','US20080229119','application'],['US2021-0273804A1','US20210273804','application'],['USD000123S1','USD123','design'],['D0000123','USD123','design'],['USRE0045678E1','USRE45678','reissue'],['RE045678','USRE45678','reissue'],['USPP0034567P3','USPP34567','plant'],['USH000001H','USH1','statutory'],['UST000012T','UST12','defensive'],['US1234567C1','US1234567','utility']];
 for(const [raw,key,type]of cases){assert.equal(normalizePatentNumber(raw),key,raw);assert.equal(patentNumber(raw).type,type,raw);assert.equal(normalizePatentNumber(toPatentsView(raw)),key);assert.equal(normalizePatentNumber(toRelianceOnScience(raw)),key);const m=toMaintenance(raw);if(m)assert.equal(normalizePatentNumber(m),key);}
 assert.notEqual(normalizePatentNumber('US20210273804A1'),normalizePatentNumber('US10095888B1'));
 for(const raw of ['CN10095888B','unknown text','US0','US20210273804B2','WO2021000001A1','', '12345678901234'])assert.equal(normalizePatentNumber(raw),raw);
 const n=new NumberNormalizer();n.normalize('unknown text');n.normalize('US10095888B1');assert.equal(n.unrecognized,1);
 assert.equal(toMaintenance('USD123S1'),null);assert.equal(toMaintenance('US20210273804A1'),null);assert.equal(toMaintenance('US6871823B2'),'06871823');
});
test('stream parsers handle UTF-8, quotes/newlines, actual RoS schema and unknown self-citation',async()=>{
 const rows=await collect(records(chunks('a,b\r\n"中,文","a""b\nc"\r\n'),',',['a','b']));assert.deepEqual(rows,[{a:'中,文',b:'a"b\nc'}]);
 await assert.rejects(()=>collect(delimited(chunks('a,"broken'))),/Unclosed/);
 await assert.rejects(()=>collect(records(chunks('a\n1,2'),',',['a'])),/columns/);
 await assert.rejects(()=>collect(records(chunks('a\n1'),',',['patent'])),/Missing column/);
 const data=await readFile(resolve(fixture,'pcs_oa_uspto.csv'),'utf8');const links=(await collect(records(chunks(data),',',['patent','oaid']))).map(r=>paperLink(r));
 assert.equal(links[0].patent_number,'US10095888');assert.equal(links[0].work_id,'W2741809807');assert.equal(links[0].self_citation,null);assert.equal(links[1].patent_number,'US20150133390');assert.equal(links[1].reference_type,'exm');
 assert.equal(paperLink({patent:'US1',oaid:'3066',confscore:'10',reftype:'app',wherefound:'both',selfcite:'1'}).self_citation,true);
 assert.throws(()=>isoDate('20250230'),/Invalid source date/);
 assert.equal(openAlexPaper({id:'https://openalex.org/W3066'},'2025-01-01').venue,null);
 const d=await discover('maintenance',{dryRun:false,output:'data/external',fixtureDir:fixture});
 const lines=(await collect(download(d.files[0],fixture))).map(b=>b.toString()).join('').trim().split('\n');assert.equal(maintenanceLine(lines[0]).event_date,'2022-10-10');assert.throws(()=>maintenanceLine('bad row'),/Unrecognized/);
 const pv=await discover('patentsview',{dryRun:false,output:'data/external',fixtureDir:fixture});const patents=await collect(records(download(pv.files[0],fixture),'\t',['patent_id','num_claims']));assert.equal(patents.length,3);
});
test('builder validates scope/limits and fixture manifest/schema upserts resume idempotently',async()=>{
 assert.throws(()=>options(['--limit','0']),/positive/);assert.throws(()=>options(['--output','/tmp/external']),/worktree/);
 const root=await mkdtemp(resolve('data/external-test-')),schema='external_test_'+randomUUID().replaceAll('-','');
 const opts={dryRun:false,limit:50,output:root,seeds:resolve(fixture,'seeds.json'),fixtureDir:fixture,schema};
 const admin=postgresPool(process.env.PG_TEST_DATABASE_URL);
 try{
  await main(undefined,opts);const first=JSON.parse(await readFile(resolve(root,'summary.json'),'utf8'));
  assert.equal(first.seedCount,50);assert.equal(first.counts.ext_patents,2);assert.equal(first.counts.ext_patent_citations,5);assert.equal(first.counts.ext_maintenance_events,2);assert.equal(first.counts.ext_patent_paper_links,2);assert.equal(first.counts.ext_papers,2);assert.equal(first.openAlexRequests,0);
  await main(undefined,opts);const next=JSON.parse(await readFile(resolve(root,'summary.json'),'utf8'));assert.deepEqual(next.counts,first.counts);assert.equal(next.subsetBytes,first.subsetBytes);
  const url=new URL(process.env.PG_TEST_DATABASE_URL!);url.searchParams.set('options','-c search_path='+schema+',public');const pool=postgresPool(url.toString());
  try{await pool.query(await readFile('migrations/043_external_reference_data.sql','utf8'));await pool.query(await readFile('migrations/043_external_reference_data.sql','utf8'));await migratePostgres(pool);
   const metadata=(await pool.query("SELECT *,application_date::text AS application_date FROM ext_patents WHERE patent_number='US10095888'")).rows[0];assert.deepEqual(metadata.assignee_countries,['US']);assert.deepEqual(metadata.cpc,['H04L9/32']);assert.equal(metadata.application_date,'2016-01-02');
   const {Build}=await import('../scripts/external/common');
   const manifestPath=resolve(root,'patentsview/fixture-v2/manifest.json'),m=JSON.parse(await readFile(manifestPath,'utf8')),cache=resolve(root,'patentsview/fixture-v2/bibliography.jsonl'),original=await readFile(cache,'utf8');
   const discovered=await discover('patentsview',opts),build=await Build.open(pool,opts,discovered,m.seeds,m.subsetRule);
   await writeFile(cache,original.replace('"claims_count":20','"claims_count":999'));
   try{await assert.rejects(build.stage('bibliography',async function*(){throw new Error('must use cache');}),/checksum/);assert.equal((await new ExternalReferenceReader(pool).patents(['US10095888B1']))[0].claims_count,20);}finally{await writeFile(cache,original);}
  }finally{await pool.end();}
 }finally{await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();await rm(root,{recursive:true,force:true});}
});
test('runtime RLS cannot write reference rows even with DML grants; reader obeys dataset scope',async()=>{
 const admin=postgresPool(process.env.DATABASE_URL),schema=(await admin.query('SELECT current_schema() s')).rows[0].s,role='ext_reader_'+randomUUID().replaceAll('-','');
 const source={id:randomUUID(),name:'fixture',version:'1',url:'https://fixture.invalid',license:'fixture',retrieved_at:new Date().toISOString(),row_count:0,bytes:0,subset_rule:'fixture',notes:{}};
 let runtime:ReturnType<typeof postgresPool>|undefined;
 try{
  await upsertExternal(admin,'external_sources',[source]);await upsertExternal(admin,'external_sources',[source]);assert.equal((await admin.query('SELECT count(*)::int n FROM external_sources WHERE id=$1',[source.id])).rows[0].n,1);
  await admin.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS`);await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);await admin.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${role}`);
  const url=new URL(process.env.DATABASE_URL!);url.username=role;runtime=postgresPool(url.toString());
  assert.equal((await runtime.query('SELECT * FROM external_sources WHERE id=$1',[source.id])).rowCount,1);
  await assert.rejects(upsertExternal(runtime,'external_sources',[{...source,id:randomUUID()}]),/row-level security/);
  assert.equal((await runtime.query('UPDATE external_sources SET version=$1 WHERE id=$2',['bad',source.id])).rowCount,0);assert.equal((await runtime.query('DELETE FROM external_sources WHERE id=$1',[source.id])).rowCount,0);
  const writes={ext_patents:{patent_number:'US1',patent_type:'utility',cpc:[],assignees:[],assignee_countries:[]},ext_patent_citations:{citing_patent:'US2',cited_patent:'US1',category:'',purpose:'D1'},ext_maintenance_events:{patent_number:'US1',event_date:'2020-01-01',event_code:'M1551',entity_type:'N'},ext_patent_paper_links:{patent_number:'US1',work_id:'W1',reference_type:'app',where_found:'both'},ext_papers:{work_id:'W1',topics:[],retrieved_at:new Date().toISOString()},external_source_seeds:{patent_number:'US1',purpose:'D1'}};
  for(const [table,row]of Object.entries(writes)){
   await assert.rejects(upsertExternal(runtime,table as keyof typeof writes,[{...row,source_id:source.id}]),/row-level security/);
   await assert.rejects(runtime.query('TRUNCATE '+table),/permission denied/);
  }
  await assert.rejects(new ExternalReferenceReader(runtime).coverage('missing'),/读取权限/);
  await assert.rejects(withAccess({userId:'x',organizationId:'x',projectId:'x'},()=>upsertExternal(admin,'external_sources',[source])),/maintenance/);
 }finally{await runtime?.end();await admin.query('DELETE FROM external_sources WHERE id=$1',[source.id]);await admin.query(`DROP OWNED BY ${role}`);await admin.query(`DROP ROLE ${role}`);await admin.end();}
});
test('OpenAlex batches at most 50 IDs and resumes saved batches after 429 without retrying quota',async()=>{
 const {openalex}=await import('../scripts/external/sources');const {Build}=await import('../scripts/external/common');
 const pool=postgresPool(process.env.DATABASE_URL),root=await mkdtemp(resolve('data/external-quota-')),sourceId=randomUUID(),seed='US12345678',fetchOriginal=globalThis.fetch;
 const d={source:'openalex',version:'quota-fixture',url:'https://api.openalex.org/works',license:'CC0',files:[]},opts={dryRun:false,output:root};
 let calls=0;
 try{
  await upsertExternal(pool,'external_sources',[{id:sourceId,name:'science-fixture',version:'1',url:'https://fixture.invalid',license:'FIXTURE',retrieved_at:new Date().toISOString(),row_count:51,bytes:0,subset_rule:'fixture',notes:{}}]);
  await upsertExternal(pool,'external_source_seeds',[{source_id:sourceId,patent_number:seed,purpose:'D4'}]);
  await upsertExternal(pool,'ext_patent_paper_links',Array.from({length:51},(_,i)=>({source_id:sourceId,patent_number:seed,work_id:'W'+String(1000+i),confidence:10,reference_type:'app',where_found:'both'})));
  globalThis.fetch=async(input)=>{
   calls++;const url=new URL(String(input)),ids=url.searchParams.get('filter')!.replace('openalex_id:','').split('|');assert.ok(ids.length<=50);
   if(calls===2)return new Response('{}',{status:429});return Response.json({results:ids.map(id=>({id:'https://openalex.org/'+id,title:'SYNTHETIC'}))});
  };
  await assert.rejects(openalex(pool,opts,d,[seed]),/429/);const first=JSON.parse(await readFile(resolve(root,'openalex/quota-fixture/manifest.json'),'utf8'));assert.equal(first.files['works-0'].rows,50);assert.equal(first.files['works-50'],undefined);assert.equal(calls,2);
  const resumed=await openalex(pool,opts,d,[seed]);assert.equal(resumed.status,'complete');assert.equal(resumed.requests,3);assert.equal(calls,3);assert.equal(resumed.files['works-50'].rows,1);
  const checksum=resumed.files['works-0'].sha256;await openalex(pool,opts,d,[seed]);assert.equal(calls,3);assert.equal(resumed.files['works-0'].sha256,checksum);
  const reader=new ExternalReferenceReader(pool);const papers=await reader.papers(['W1000']);assert.equal(papers[0].title,'SYNTHETIC');
 }finally{globalThis.fetch=fetchOriginal;await pool.query('DELETE FROM ext_papers WHERE source_id IN (SELECT id FROM external_sources WHERE version=$1)',['quota-fixture']);await pool.query('DELETE FROM external_source_seeds WHERE source_id=$1 OR source_id IN (SELECT id FROM external_sources WHERE version=$2)',[sourceId,'quota-fixture']);await pool.query('DELETE FROM ext_patent_paper_links WHERE source_id=$1',[sourceId]);await pool.query('DELETE FROM external_sources WHERE id=$1 OR version=$2',[sourceId,'quota-fixture']);await pool.end();await rm(root,{recursive:true,force:true});}
});
test('ODP discovery parses paginated file metadata and makes filesystem-safe version names',async()=>{
 const fetchOriginal=globalThis.fetch,keyOriginal=process.env.USPTO_ODP_API_KEY;let calls=0;process.env.USPTO_ODP_API_KEY='test-only-placeholder';
 try{
  globalThis.fetch=async(input)=>{calls++;const url=new URL(String(input));if(calls===2)assert.equal(url.searchParams.get('offset'),'2');const names=calls===1?['g_patent.tsv.zip','g_application.tsv.zip']:['g_cpc_current.tsv.zip'];return Response.json({bulkDataProductBag:[{productFileTotalQuantity:3,productFileBag:{fileDataBag:names.map(fileName=>({fileName,fileDownloadURI:'https://api.uspto.gov/'+fileName,fileSize:123,fileReleaseDate:'2026-10-01 00:00:00'}))}}]});};
  const result=await discover('patentsview',{dryRun:true,output:'data/external'});assert.equal(calls,2);assert.equal(result.version,'2026-10-01_00_00_00');assert.equal(result.files.length,3);assert.equal(result.files[0].size,123);
 }finally{globalThis.fetch=fetchOriginal;if(keyOriginal===undefined)delete process.env.USPTO_ODP_API_KEY;else process.env.USPTO_ODP_API_KEY=keyOriginal;}
});
