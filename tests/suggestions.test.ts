import {test} from 'node:test';
import assert from 'node:assert/strict';
import {questions,suggest} from '../src/lib/suggestions';
import {TOOL_DEFS} from '../src/server/tools';
test('suggestions cover tools, exclude unavailable abilities and rotate without duplication',()=>{
 const tools=TOOL_DEFS.map(([name,title,group])=>({name:String(name),title:String(title),group:String(group),available:true}));
 assert.ok(tools.every(t=>questions[t.name]),'every supported tool has a grounded question');
 const first=suggest(tools,[],()=>.5);assert.equal(first.length,4);assert.equal(new Set(first.map(t=>t.name)).size,4);assert.equal(new Set(first.map(t=>t.group)).size,4);
 const next=suggest(tools,first.map(t=>t.name),()=>.5);assert.ok(next.every(t=>!first.some(p=>p.name===t.name)));
 assert.deepEqual(suggest(tools.map(t=>({...t,available:false}))),[]);
 assert.equal(suggest([tools[0]]).length,1);
});
