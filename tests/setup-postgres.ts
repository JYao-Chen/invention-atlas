import {randomUUID} from 'node:crypto';
import {after} from 'node:test';
import {Pool} from 'pg';
import {migratePostgres} from '../src/server/postgres';

const base=process.env.PG_TEST_DATABASE_URL;
if(!base)throw new Error('PG_TEST_DATABASE_URL must point to the dedicated test database');
const admin=new Pool({connectionString:base});
const schema='test_'+randomUUID().replaceAll('-','');
await admin.query(`CREATE SCHEMA ${schema}`);
const url=new URL(base);
url.searchParams.set('options','-c search_path='+schema+',public');
process.env.DATABASE_URL=url.toString();
const init=new Pool({connectionString:process.env.DATABASE_URL});
await migratePostgres(init);await init.end();
after(async()=>{
 const state=globalThis as unknown as {patentPool?:Pool};
 if(state.patentPool)await state.patentPool.end();
 await admin.query(`DROP SCHEMA ${schema} CASCADE`);
 await admin.end();
});
