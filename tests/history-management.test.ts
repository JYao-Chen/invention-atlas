import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {Run} from '../src/lib/types';
process.env.PATENT_DATA_DIR=mkdtempSync(join(tmpdir(),'patent-history-'));
const {db,newConversation,saveRun,saveReport,run,reports,event,events,setting,conversations}=await import('../src/server/db');
const {deleteSaved}=await import('../src/server/history-management');
async function fixture(){const c=(await newConversation('test-dataset'));const r:Run={id:c.id+'-run',conversationId:c.id,datasetId:c.datasetId,question:'Fixture',status:'completed',plan:[],results:[],answer:'Saved evidence',error:'',model:'test',createdAt:new Date().toISOString()};(await saveRun(r));(await event(r.id,'text-delta',{text:r.answer}));(await setting('evaluation:'+r.id,'{}'));return {c,r,report:(await saveReport(r,'Fixture report'))};}
test('single and bulk report deletion preserves conversation, runs and other reports',async ()=>{
 const a=await fixture(),b=await fixture(),keep=await fixture();assert.equal((await deleteSaved('reports',[a.report,a.report,b.report])).deleted,2);assert.ok((await run(a.r.id)));assert.ok((await conversations()).some(c=>c.id===a.c.id));assert.ok((await reports()).some(r=>r.id===keep.report));assert.ok(!(await reports()).some(r=>r.id===a.report));
});
test('conversation batch deletion removes runs, events and review records but preserves report snapshots',async ()=>{
 const a=await fixture(),b=await fixture(),keep=await fixture();assert.equal((await deleteSaved('conversations',[a.c.id,b.c.id])).deleted,2);assert.equal((await run(a.r.id)),undefined);assert.deepEqual((await events(a.r.id,0)),[]);assert.equal((await setting('evaluation:'+a.r.id)),undefined);assert.ok((await run(keep.r.id)));assert.equal((await reports()).find(r=>r.id===a.report)?.run.answer,'Saved evidence');
});
test('missing IDs, empty batches and active runs leave the entire selection untouched',async ()=>{
 const a=await fixture(),b=await fixture();await assert.rejects(async ()=>(await deleteSaved('reports',[a.report,'missing'])),/不存在/);assert.ok((await reports()).some(r=>r.id===a.report));await assert.rejects(async ()=>(await deleteSaved('conversations',[a.c.id,b.c.id],id=>id===b.r.id)),/停止/);assert.ok((await run(a.r.id)));assert.ok((await run(b.r.id)));await assert.rejects(async ()=>(await deleteSaved('reports',[])));assert.ok((await db.query('SELECT id FROM reports WHERE id=$1',[a.report])).rows[0]);
});
test('persisted running state prevents deletion without a local executor marker',async()=>{
 const {c,r}=await fixture();r.status='running';await saveRun(r);
 await assert.rejects(deleteSaved('conversations',[c.id]),/停止/);
 assert.equal((await run(r.id))?.status,'running');
 r.status='cancelled';await saveRun(r);
 assert.equal((await deleteSaved('conversations',[c.id])).deleted,1);
});
