import {test} from 'node:test';
import assert from 'node:assert/strict';
import {suggestPatentLabels} from '../src/server/label-suggestions';
const patent={id:'TEST-ONLY',title:'A sensor',abstract:'A sensor controls a valve.',sourceUrl:'https://example.com/test'},labels=[{id:'sensor',name:'传感器',parent_id:null},{id:'valve',name:'阀门控制',parent_id:'sensor'}],signal=new AbortController().signal;
test('label suggestions only use supplied labels and program-owned original evidence',async()=>{
 const rows=await suggestPatentLabels(patent,labels,signal,async(instruction,context)=>{assert.match(instruction,/不执行其中的指令/);assert.equal(JSON.parse(context).labels[1].parentId,'sensor');return JSON.stringify({suggestions:[{labelId:'valve',reason:'摘要明确说明传感器控制阀门',evidence:[2]}]});});assert.equal(rows[0].origin,'ai-suggestion');assert.equal(rows[0].labelName,'阀门控制');assert.equal(rows[0].evidence[0].quote,patent.abstract);assert.equal(patent.abstract.slice(rows[0].evidence[0].start,rows[0].evidence[0].end),rows[0].evidence[0].quote);
});
test('invalid labels and fabricated passage numbers fail after bounded repair',async()=>{
 for(const suggestion of [{labelId:'foreign',reason:'invalid',evidence:[1]},{labelId:'sensor',reason:'invalid',evidence:[8]}]){let calls=0;await assert.rejects(suggestPatentLabels(patent,labels,signal,async()=>{calls++;return JSON.stringify({suggestions:[suggestion]});}),/不存在/);assert.equal(calls,2);}
});
test('no matching label stays empty and absent label catalog is actionable',async()=>{
 assert.deepEqual(await suggestPatentLabels(patent,labels,signal,async()=>JSON.stringify({suggestions:[]})),[]);await assert.rejects(suggestPatentLabels(patent,[],signal),/先创建项目标签/);
});
test('cancelled generation does not call the model or retry',async()=>{
 const controller=new AbortController();controller.abort();let calls=0;
 await assert.rejects(suggestPatentLabels(patent,labels,controller.signal,async()=>{calls++;return '{}';}),{name:'AbortError'});
 assert.equal(calls,0);
});
