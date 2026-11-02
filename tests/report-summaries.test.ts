import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PostgresStore} from '../src/server/postgres-store';
import {postgresPool} from '../src/server/postgres';
test('report list summaries omit full bodies and tool data while retaining counts and full snapshots',async()=>{
 const db=postgresPool(),store=new PostgresStore(db),id=randomUUID();
 const payload={run:{id:'summary-test',answer:'完整正文',results:[{id:'a',summary:'结果',method:'方法',warnings:[],data:{members:['原始记录']}},{id:'b',summary:'结果',method:'方法',warnings:[]}]}};
 try{
  await db.query('INSERT INTO reports(id,title,run_id,payload,created_at) VALUES($1,$2,$3,$4,$5)',[id,'测试报告','summary-test',JSON.stringify(payload),'2026-11-02T00:00:00.000Z']);
  const rows=await store.reportSummaries();assert.equal(rows.length,1);assert.deepEqual(rows[0],{id,title:'测试报告',createdAt:'2026-11-02T00:00:00.000Z',resultCount:2});
  assert.equal('run' in rows[0],false);assert.equal((await store.reports())[0].run.answer,'完整正文');
 }finally{await db.end();}
});
