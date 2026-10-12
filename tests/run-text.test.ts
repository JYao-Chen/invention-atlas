import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Run} from '../src/lib/types';
import {runTextWriter} from '../src/server/run-text';

test('all report deltas are persisted in order while large run snapshots are checkpointed and flushed',async()=>{
 const run:Run={id:'fixture',conversationId:'fixture',datasetId:'fixture',question:'fixture',status:'running',plan:[],results:[],answer:'',error:'',model:'fixture',createdAt:new Date().toISOString()};
 const deltas:string[]=[],snapshots:string[]=[];let now=0;
 const writer=runTextWriter(run,async(_id,name,payload)=>{assert.equal(name,'text-delta');deltas.push((payload as {text:string}).text);return deltas.length;},async current=>{snapshots.push(current.answer);},()=>now);
 await writer.push('甲');now=1100;await writer.push('乙');now=1200;await writer.push('丙');
 assert.deepEqual(deltas,['甲','乙','丙']);
 assert.deepEqual(snapshots,['甲乙']);
 await writer.flush();
 assert.deepEqual(snapshots,['甲乙','甲乙丙']);
});
