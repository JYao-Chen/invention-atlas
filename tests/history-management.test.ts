import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {Run} from '../src/lib/types';
process.env.PATENT_DATA_DIR=mkdtempSync(join(tmpdir(),'patent-history-'));
const {db,newConversation,saveRun,saveReport,run,reports,event,events,setting,conversations}=await import('../src/server/db');
const {deleteSaved}=await import('../src/server/history-management');
function fixture(){const c=newConversation('test-dataset');const r:Run={id:c.id+'-run',conversationId:c.id,datasetId:c.datasetId,question:'Fixture',status:'completed',plan:[],results:[],answer:'Saved evidence',error:'',model:'test',createdAt:new Date().toISOString()};saveRun(r);event(r.id,'text-delta',{text:r.answer});setting('evaluation:'+r.id,'{}');return {c,r,report:saveReport(r,'Fixture report')};}
test('single and bulk report deletion preserves conversation, runs and other reports',()=>{
 const a=fixture(),b=fixture(),keep=fixture();assert.equal(deleteSaved('reports',[a.report,a.report,b.report]).deleted,2);assert.ok(run(a.r.id));assert.ok(conversations().some(c=>c.id===a.c.id));assert.ok(reports().some(r=>r.id===keep.report));assert.ok(!reports().some(r=>r.id===a.report));
});
test('conversation batch deletion removes runs, events and review records but preserves report snapshots',()=>{
 const a=fixture(),b=fixture(),keep=fixture();assert.equal(deleteSaved('conversations',[a.c.id,b.c.id]).deleted,2);assert.equal(run(a.r.id),undefined);assert.deepEqual(events(a.r.id,0),[]);assert.equal(setting('evaluation:'+a.r.id),undefined);assert.ok(run(keep.r.id));assert.equal(reports().find(r=>r.id===a.report)?.run.answer,'Saved evidence');
});
test('missing IDs, empty batches and active runs leave the entire selection untouched',()=>{
 const a=fixture(),b=fixture();assert.throws(()=>deleteSaved('reports',[a.report,'missing']),/不存在/);assert.ok(reports().some(r=>r.id===a.report));assert.throws(()=>deleteSaved('conversations',[a.c.id,b.c.id],id=>id===b.r.id),/停止/);assert.ok(run(a.r.id));assert.ok(run(b.r.id));assert.throws(()=>deleteSaved('reports',[]));assert.ok(db.prepare('SELECT id FROM reports WHERE id=?').get(a.report));
});
