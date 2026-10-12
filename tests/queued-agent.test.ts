import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Run} from '../src/lib/types';
import type {Job} from '../src/server/job-store';
import {store} from '../src/server/db';
import {normalize,datasetMeta} from '../src/server/importers';
import {executeQueuedRun,cancelQueuedRun} from '../src/server/queued-agent';

async function fixture(){
 const patent=normalize({id:'US888B1',title:'Queued fixture',abstract:'Synthetic text'},'TEST');
 const meta=datasetMeta('Queued fixture',[patent],'fixture','fixture');await store.saveDataset(meta,[patent]);
 const conversation=await store.newConversation(meta.id);
 const run:Run={id:randomUUID(),conversationId:conversation.id,datasetId:meta.id,question:'Fixture',status:'running',plan:[],results:[],answer:'',error:'',model:'fixture',createdAt:new Date().toISOString()};await store.saveRun(run);
 const job:Job={id:randomUUID(),runId:run.id,actorId:'fixture',organizationId:'fixture',projectId:'fixture',kind:'analysis',payload:{forced:[{tool:'get_dataset_summary',params:{}}],toolOnly:true},state:'running',attempts:1,workerId:'fixture',cancelRequested:false};
 return {run,job};
}

test('queued execution saves a single terminal event and does not repeat a committed run after reclaim',async()=>{
 const {run,job}=await fixture();await executeQueuedRun(job,new AbortController().signal);
 const completed=(await store.run(run.id))!;assert.equal(completed.status,'completed');assert.equal(completed.results.length,1);
 await executeQueuedRun({...job,attempts:2},new AbortController().signal);
 assert.equal((await store.events(run.id)).filter(e=>e.event==='done').length,1);
 assert.equal((await store.run(run.id))!.results[0].id,completed.results[0].id);
});

test('shutdown leaves the run recoverable; user cancellation writes an idempotent terminal state',async()=>{
 const {run,job}=await fixture();const shutdown=new AbortController();shutdown.abort();
 await assert.rejects(executeQueuedRun(job,shutdown.signal));assert.equal((await store.run(run.id))?.status,'running');
 assert.equal((await store.events(run.id)).some(e=>e.event==='done'),false);
 await cancelQueuedRun(job);await cancelQueuedRun(job);
 assert.equal((await store.run(run.id))?.status,'cancelled');assert.equal((await store.events(run.id)).filter(e=>e.event==='done').length,1);
});
