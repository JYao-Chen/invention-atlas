import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';
import {Pool} from 'pg';
import {IdentityStore} from '../src/server/identity';
import {normalize,datasetMeta} from '../src/server/importers';
import {importBundle,VERSION,type Entry,type Header} from '../scripts/demo/bundle';

test('demo import is atomic, project-owned, repeatable, and preserves source text and vectors',async()=>{
 const pool=new Pool({connectionString:process.env.DATABASE_URL}),directory=await mkdtemp(join(tmpdir(),'atlas-demo-'));
 try{
  const identity=await new IdentityStore(pool).initializeAdmin('demo-admin','demo-password-long','Demo');
  const target={userId:identity.user!.id,organizationId:identity.organizationId,projectId:identity.projectId};
  const patent={...normalize({id:'US123456B1',title:'A fixture patent',abstract:'Original abstract',description:'Original full text',claims:[{number:1,text:'Original claim.'}]},'fixture'),embedding:Array(1024).fill(0.25)};
  const meta=datasetMeta('演示测试',[patent],'fixture','fixture');
  const header:Header={kind:'header',version:VERSION,part:'core',counts:{datasets:1,patents:2},defaultDatasetId:meta.id,embedding:{model:'text-embedding-v4',dimensions:1024,input:'title + newline + abstract'}};
  const entries:Entry[]=[header,{kind:'dataset',value:meta},{kind:'patent',datasetId:meta.id,value:patent}];
  const file=join(directory,'core.jsonl.gz'),save=()=>writeFile(file,gzipSync(entries.map(e=>JSON.stringify(e)).join('\n')));
  await save();await assert.rejects(importBundle(pool,file,target),/条数不符/);
  assert.equal((await pool.query('SELECT count(*) AS n FROM datasets')).rows[0].n,'0');
  header.counts.patents=1;await save();const first=await importBundle(pool,file,target);assert.equal(first.skipped,false);
  const row=(await pool.query('SELECT p.payload,d.organization_id,d.project_id FROM patents p JOIN datasets d ON d.id=p.dataset_id')).rows[0];
  assert.deepEqual(row.payload,JSON.parse(JSON.stringify(patent)));assert.equal(row.organization_id,target.organizationId);assert.equal(row.project_id,target.projectId);
  await pool.query("UPDATE patents SET payload=jsonb_set(payload,'{title}','\"User edited title\"')");
  assert.equal((await importBundle(pool,file,target)).skipped,true);
  assert.equal((await pool.query("SELECT payload->>'title' AS title FROM patents")).rows[0].title,'User edited title');
  assert.equal((await pool.query("SELECT value FROM user_preferences WHERE user_id=$1 AND key=$2",[target.userId,'active_dataset:'+target.projectId])).rows[0].value,meta.id);
  const papers=join(directory,'papers.jsonl.gz');
  await writeFile(papers,gzipSync(JSON.stringify({...header,part:'papers',counts:{external_sources:1,ext_patent_paper_links:1}})+'\n'+JSON.stringify({kind:'external',table:'external_sources',value:{id:'demo-source',name:'fixture',version:'1',url:'https://example.org',license:'CC0',retrieved_at:'2026-10-30',sha256:null,row_count:0,bytes:0,subset_rule:'fixture',notes:{}}})+'\n'+JSON.stringify({kind:'external',table:'ext_patent_paper_links',value:{patent_number:'123456',work_id:'W123',confidence:10,reference_type:'app',self_citation:null,where_found:'front',source_id:'demo-source'}})));
  assert.equal((await importBundle(pool,papers,target)).skipped,false);assert.equal((await importBundle(pool,papers,target)).skipped,true);
  await assert.rejects(importBundle(pool,file,{...target,projectId:'other-project'}),/拥有的项目/);
 }finally{await pool.end();await rm(directory,{recursive:true,force:true});}
});
