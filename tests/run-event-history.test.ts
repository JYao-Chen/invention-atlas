import {test} from 'node:test';
import assert from 'node:assert/strict';
import {collapseTextHistory} from '../src/lib/run-event-history';
const event=(seq:number,name:string,data:unknown)=>({seq,event:name,payload:JSON.stringify(data)});
test('restoring a running answer emits one complete text snapshot and preserves tool events',()=>{
 const tool=event(2,'tool-result',{result:{id:'result-1'}});
 const history=[event(1,'text-delta',{text:'第一段。'}),tool,event(3,'text-delta',{text:'第二段。'})];
 const restored=collapseTextHistory(history);
 assert.deepEqual(restored,[tool,event(3,'text-snapshot',{text:'第一段。第二段。'})]);
 assert.equal(history.length,3);
});
test('restoration respects report regeneration resets including an empty new answer',()=>{
 assert.deepEqual(collapseTextHistory([event(1,'text-delta',{text:'旧稿'}),event(2,'text-reset',{}),event(3,'text-delta',{text:'新稿'})]),[event(3,'text-snapshot',{text:'新稿'})]);
 assert.deepEqual(collapseTextHistory([event(1,'text-delta',{text:'旧稿'}),event(2,'text-reset',{})]),[event(2,'text-snapshot',{text:''})]);
});
test('preparation without text keeps its original events',()=>{
 assert.deepEqual(collapseTextHistory([]),[]);
 const history=[event(1,'progress',{unit:'读取原文'})];
 assert.deepEqual(collapseTextHistory(history),history);
});
