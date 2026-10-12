import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseNoveltyComparison,compareProposalFeatures,validateComparisonRows,comparisonPassages} from '../src/server/novelty-comparison';
import type {PatentChunk} from '../src/server/patent-chunks';
const features=[{id:'F1',feature:'温度传感器'}];
const chunks:PatentChunk[]=[{patentId:'TEST-ONLY',documentVersion:'fixture-v1',section:'description',ordinal:0,start:20,end:29,text:'包含温度传感器。',sourceUrl:'',chunkingVersion:'field-offset-v1'}];
const row={featureId:'F1',assessment:'supported',explanation:'合成测试',evidence:[{chunk:1,quote:'温度传感器'}]};
test('comparison preserves exact source offsets and rejects fabricated evidence',()=>{
 const result=parseNoveltyComparison(features,chunks,{comparisons:[row]});
 assert.equal(result[0].evidence[0].start,22);assert.equal(result[0].evidence[0].end,27);
 assert.throws(()=>parseNoveltyComparison(features,chunks,{comparisons:[{...row,evidence:[{chunk:1,quote:'压力传感器'}]}]}),/原文/);
 assert.throws(()=>parseNoveltyComparison(features,chunks,{comparisons:[{...row,assessment:'not_found'}]}),/状态/);
 assert.throws(()=>parseNoveltyComparison(features,chunks,{comparisons:[]}),/覆盖/);
});
test('comparison repairs invalid source evidence before returning a result',async()=>{
 let calls=0;
 const result=await compareProposalFeatures(features,chunks,new AbortController().signal,async(instruction,context)=>{
  assert.match(instruction,/主体或被处理对象不同.*必须用not_found/);assert.match(instruction,/partial仅用于主体和被处理对象一致/);
  assert.match(instruction,/解释只描述本批提供的原文片段/);assert.match(instruction,/不得写成整件专利未公开该特征/);
  if(calls){assert.match(instruction,/修正previousOutput/);assert.equal(JSON.parse(JSON.parse(context).previousOutput).comparisons[0].evidence[0],9);}
  return JSON.stringify({comparisons:[{...row,evidence:[calls++?1:9]}]});
 });
 assert.equal(calls,2);assert.equal(result[0].assessment,'supported');
});
test('edited comparison cannot move evidence to another patent or change its offsets',()=>{
 const rows=parseNoveltyComparison(features,chunks,{comparisons:[row]});
 assert.equal(validateComparisonRows(features,chunks,rows).length,1);
 const evidence=rows[0].evidence[0];
 assert.throws(()=>validateComparisonRows(features,chunks,[{...rows[0],evidence:[{...evidence,patentId:'OTHER'}]}]),/原文片段/);
 assert.throws(()=>validateComparisonRows(features,chunks,[{...rows[0],evidence:[{...evidence,start:evidence.start+1}]}]),/原文片段/);
 assert.throws(()=>validateComparisonRows(features,chunks,[{...rows[0],featureId:'UNKNOWN'}]),/覆盖/);
});
test('persistent evidence objects fail instead of masquerading as source identifiers',async()=>{
 await assert.rejects(compareProposalFeatures(features,chunks,new AbortController().signal,async()=>JSON.stringify({comparisons:[{...row,evidence:[{}]}]})),error=>error instanceof Error&&error.message.includes('模型未按对比结构返回证据')&&error.message.includes('evidence.0'));
});
test('numbered source passages cover all text and produce exact field offsets',async()=>{
 const text='x'.repeat(600)+'这里是原文证据'+'y'.repeat(610),source={...chunks[0],start:100,end:100+text.length,rawStart:2000,rawEnd:2000+text.length,text};
 const passages=comparisonPassages([source]);assert.equal(passages.map(p=>p.text).join(''),text);
 assert.equal(passages[1].rawStart,2600);assert.equal(passages[1].rawEnd,3200);
 const rows=await compareProposalFeatures(features,[source],new AbortController().signal,async()=>JSON.stringify({comparisons:[{...row,evidence:[2]}]}));
 assert.equal(rows[0].evidence[0].start,700);assert.equal(rows[0].evidence[0].end,1300);
 assert.equal(rows[0].evidence[0].quote,text.slice(600,1200));
});
