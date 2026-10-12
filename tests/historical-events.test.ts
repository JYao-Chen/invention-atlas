import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {postgresPool,withAccess,connection} from '../src/server/postgres';
import {IdentityStore} from '../src/server/identity';
import {PostgresStore} from '../src/server/postgres-store';
test('long proposal checkpoint keys preserve full originals and remain reusable',async()=>{
 const pool=postgresPool(),store=new PostgresStore(pool),key=JSON.stringify(['v3','historical-dataset',randomBytes(12000).toString('hex')]);
 await store.saveComparisonCheckpoint(key,{original:'first'});
 assert.deepEqual(await store.comparisonCheckpoint(key),{original:'first'});
 await store.saveComparisonCheckpoint(key,{original:'updated'});
 assert.deepEqual(await store.comparisonCheckpoint(key),{original:'updated'});
 const saved=(await pool.query('SELECT key FROM comparison_checkpoints WHERE key_hash=md5($1)',[key])).rows[0];assert.equal(saved.key,key);
});
test('legacy detached events are preserved by maintenance but hidden and unwritable at runtime',async()=>{
 const owner=postgresPool(),identity=await new IdentityStore(owner).initializeAdmin('legacy-admin','legacy-password-123','Legacy event test');
 const scope={userId:identity.user!.id,organizationId:identity.organizationId,projectId:identity.projectId};
 const schema=(await owner.query('SELECT current_schema() name')).rows[0].name,role='legacy_'+randomUUID().replaceAll('-','');
 let runtime:ReturnType<typeof postgresPool>|undefined;
 try{
  await owner.query('INSERT INTO events(run_id,event,payload) VALUES($1,$2,$3)',['deleted-legacy-run','report-delta',JSON.stringify({text:'original historical text'})]);
  assert.equal((await owner.query('SELECT payload FROM events')).rows[0].payload.text,'original historical text');
  await owner.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS`);await owner.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);await owner.query(`GRANT SELECT,INSERT ON ALL TABLES IN SCHEMA ${schema} TO ${role}`);await owner.query(`GRANT USAGE ON ALL SEQUENCES IN SCHEMA ${schema} TO ${role}`);
  const url=new URL(process.env.DATABASE_URL!);url.username=role;url.password='';runtime=postgresPool(url.toString());
  await withAccess(scope,async()=>{
   assert.equal((await connection(runtime!).query('SELECT * FROM events')).rowCount,0);
   await assert.rejects(connection(runtime!).query('INSERT INTO events(run_id,event,payload) VALUES($1,$2,$3)',['another-missing-run','report-delta','{}']),/row-level security/);
  });
 }finally{if(runtime)await runtime.end();await owner.query(`DROP OWNED BY ${role}`);await owner.query(`DROP ROLE ${role}`);}
});
