import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {postgresPool} from '../src/server/postgres';
import {PostgresStore} from '../src/server/postgres-store';
import {IdentityStore} from '../src/server/identity';
import {withAccess} from '../src/server/postgres';
import {submitFulltextIndex} from '../src/server/fulltext-job';
import {JobStore} from '../src/server/job-store';
import {normalize,datasetMeta} from '../src/server/importers';
test('fulltext submission persists exact range and rejects concurrent or foreign ranges',async()=>{
 const pool=postgresPool(process.env.DATABASE_URL),role='index_'+randomUUID().replaceAll('-','');let runtime:ReturnType<typeof postgresPool>|undefined;try{
  const store=new PostgresStore(pool),patent=normalize({id:'USINDEXTEST',abstract:'Synthetic index fixture'},'TEST'),meta=datasetMeta('fixture',[patent],'fixture','fixture');await store.saveDataset(meta,[patent]);
  const admin=await new IdentityStore(pool).initializeAdmin('index-admin','index-password-123','Index test');
  const schema=(await pool.query('SELECT current_schema() AS name')).rows[0].name;
  await pool.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS`);await pool.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);await pool.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${role}`);await pool.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO ${role}`);
  const url=new URL(process.env.DATABASE_URL!);url.username=role;url.password='';runtime=postgresPool(url.toString());const business=runtime;
  await withAccess({userId:admin.user!.id,organizationId:admin.organizationId,projectId:admin.projectId},async()=>{
   await assert.rejects(submitFulltextIndex(business,{datasetId:meta.id,version:'v1',patentIds:['FOREIGN']},'fixture-model'),/以外/);
   const run=await submitFulltextIndex(business,{datasetId:meta.id,version:'v1',patentIds:[patent.id,patent.id]},'fixture-model'),job=await new JobStore(business).forRun(run.id);
   assert.equal(job?.kind,'fulltext');assert.deepEqual(job?.payload.patentIds,[patent.id]);assert.equal(job?.payload.model,'fixture-model');assert.equal(job?.state,'queued');
   await assert.rejects(submitFulltextIndex(business,{datasetId:meta.id,version:'v2'},'fixture-model'),/已有全文索引/);
  });
 }finally{await runtime?.end();await pool.query(`DROP OWNED BY ${role}`);await pool.query(`DROP ROLE ${role}`);await pool.end();}
});
