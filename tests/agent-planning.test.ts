import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planned} from '../src/server/agent';
import {normalize} from '../src/server/importers';

test('fulltext planning includes version metadata and repairs invalid model keys without silently coercing them',async()=>{
 const records=[normalize({id:'US123B1',abstract:'network authentication'},'TEST')];let calls=0;
 const result=await planned('请调用全文片段检索工具 search_patent_passages 针对 US123B1 检索 network',records,new AbortController().signal,'fixture',async(system,user)=>{
  assert.ok(system.includes('index_version'));
  const context=JSON.parse(user.split('\n上次计划')[0]);const tool=context.tools.find((t:{tool:string})=>t.tool==='search_patent_passages');
  assert.equal(typeof tool.parameters.index_version,'string');
  if(++calls===1)return JSON.stringify({scope:{mode:'dataset'},steps:[{tool:'search_patent_passages',params:{':':'network'}}]});
  assert.ok(user.includes('校验错误'));
  return JSON.stringify({scope:{mode:'dataset'},steps:[{tool:'search_patent_passages',params:{query:'network',index_version:'v1',patent_numbers:['US123B1']}}]});
 });
 assert.equal(calls,2);assert.equal(result.steps[0].params.index_version,'v1');
 assert.deepEqual(result.steps[0].params.patent_numbers,['US123B1']);
});
