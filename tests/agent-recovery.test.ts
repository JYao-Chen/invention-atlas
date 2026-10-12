import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {executeRun} from '../src/server/agent';
import {store} from '../src/server/db';
import {normalize,datasetMeta} from '../src/server/importers';
import type {Run,AnalysisResult} from '../src/lib/types';

test('saved stage and completed tool results resume without rerunning completed analysis',async()=>{
 const patent=normalize({id:'US555B1',title:'Fixture',abstract:'Fixture text'},'TEST'),meta=datasetMeta('Recovery fixture',[patent],'fixture','fixture');
 await store.saveDataset(meta,[patent]);const conversation=await store.newConversation(meta.id);
 const params={counting:'publication' as const};
 const result:AnalysisResult={id:randomUUID(),tool:'get_dataset_summary',title:'Saved result',status:'completed',datasetId:meta.id,params,summary:'Already computed',rows:[{saved:true}],warnings:[],method:'fixture',evidence:[patent.id],createdAt:new Date().toISOString()};
 const run:Run={id:randomUUID(),conversationId:conversation.id,datasetId:meta.id,datasetSnapshot:meta,question:'Recovery fixture',status:'running',plan:[{tool:'get_dataset_summary',params}],results:[result],answer:'',error:'',model:'fixture',createdAt:new Date().toISOString(),executionStage:'ResearchReview',scope:{mode:'dataset',patentIds:[patent.id],counting:'publication',selections:[],notes:[]}};
 await store.saveRun(run);
 await executeRun(run,undefined,true,new AbortController().signal);
 assert.equal(run.results.length,1);assert.equal(run.results[0].id,result.id);assert.deepEqual(run.results[0].rows,[{saved:true}]);
 assert.equal(run.executionStage,'Report');
 const events=await store.events(run.id);
 const completed=events.filter(event=>event.event==='stage-complete').map(event=>JSON.parse(event.payload).stage);
 assert.deepEqual(completed,['Analysis','Claim','Comparison','Citation','Audit','Report']);
 assert.equal(events.some(event=>event.event==='tool-start'),false);
});
