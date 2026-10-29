import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {withAccess} from '../src/server/postgres';
import {normalize,datasetMeta} from '../src/server/importers';
import {upsertExternal} from '../src/server/external/store';
test('external coverage HTTP requires login and dataset read access, including readers and foreign projects',async()=>{
 const admin=new Pool({connectionString:process.env.DATABASE_URL}),role='ext_http_'+randomUUID().replaceAll('-','');
 const schema=(await admin.query('SELECT current_schema() name')).rows[0].name;
 await admin.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS`);await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);await admin.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${role}`);await admin.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO ${role}`);
 const url=new URL(process.env.DATABASE_URL!);url.username=role;const runtime=new Pool({connectionString:url.toString()});(globalThis as unknown as {patentPool:Pool}).patentPool=runtime;
 try{
  const {GET}=await import('../src/app/api/[...path]/route');const {identity}=await import('../src/server/auth');const {store}=await import('../src/server/db');
  const owner=await identity.initializeAdmin('ext-admin','external-password-123','External fixture org');
  const request=(path:string,cookie='',method='GET',body?:unknown)=>GET(new Request('http://localhost/api/'+path,{method,headers:{cookie,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),{params:Promise.resolve({path:path.split('/')})});
  const login=await request('login','','POST',{username:'ext-admin',password:'external-password-123'});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie')!.split(';')[0];
  const patent=normalize({id:'US10095888B1',title:'Synthetic corpus grant'},'FIXTURE'),meta=datasetMeta('Fixture',[patent],'FIXTURE','FIXTURE');
  await withAccess({userId:owner.user!.id,organizationId:owner.organizationId,projectId:owner.projectId},()=>store.saveDataset(meta,[patent]));
  const sourceId=randomUUID();await upsertExternal(admin,'external_sources',[{id:sourceId,name:'fixture',version:'1',url:'https://fixture.invalid',license:'FIXTURE',retrieved_at:new Date().toISOString(),row_count:0,bytes:0,subset_rule:'fixture',notes:{}}]);
  await upsertExternal(admin,'ext_patent_citations',[{citing_patent:'US11000001',cited_patent:'US10095888',category:'examiner',purpose:'D1',source_id:sourceId}]);
  await upsertExternal(admin,'external_source_seeds',[{source_id:sourceId,patent_number:'US10095888',purpose:'D1'}]);
  const path='datasets/'+meta.id+'/external-coverage';assert.equal((await request(path)).status,401);
  const response=await request(path,cookie);assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');const coverage=await response.json();assert.equal(coverage.total,1);assert.equal(coverage.covered.forward_citations,1);assert.equal(coverage.covered.maintenance,0);assert.deepEqual(coverage.completedScans,[{purpose:'D1',patents:1}]);
  assert.equal((await request(path,cookie,'POST',{})).status,405);
  const invite=await identity.createInvite(owner.user!.id,owner.organizationId),reader=await identity.registerInvitation(invite.token,'ext-reader','external-reader-123','reader');await identity.setProjectMember(owner.user!.id,owner.projectId,reader.user.id,'reader');
  const readerLogin=await request('login','','POST',{username:'ext-reader',password:'external-reader-123'}),readerCookie=readerLogin.headers.get('set-cookie')!.split(';')[0];await request('workspace',readerCookie,'PATCH',{projectId:owner.projectId});assert.equal((await request(path,readerCookie)).status,200);
  const other=await identity.createProject(owner.user!.id,owner.organizationId,'Other fixture project');await request('workspace',cookie,'PATCH',{projectId:other.id});assert.equal((await request(path,cookie)).status,404);
  const {openApiDocument}=await import('../src/server/openapi');assert.ok(openApiDocument().paths['/datasets/{id}/external-coverage']);
 }finally{await runtime.end();delete (globalThis as unknown as {patentPool?:Pool}).patentPool;await admin.query(`DROP OWNED BY ${role}`);await admin.query(`DROP ROLE ${role}`);await admin.end();}
});
