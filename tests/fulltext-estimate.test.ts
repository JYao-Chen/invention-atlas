import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalize} from '../src/server/importers';
import {chunkPatent} from '../src/server/patent-chunks';
import {estimateFulltext} from '../src/server/fulltext-estimate';
test('index estimates include actual overlapping chunks, no model calls, and unique documents',async()=>{
 const patent=normalize({id:'ESTIMATE',abstract:'中文 authentication',description:'A long paragraph. '.repeat(400)},'TEST'),parts=chunkPatent(patent,'v1',{maxClaimChars:6000});
 const estimate=await estimateFulltext({patentIds:[patent.id,patent.id],version:'v1',signal:new AbortController().signal,read:async()=>patent});
 assert.equal(estimate.documents,1);assert.equal(estimate.chunks,parts.length);assert.equal(estimate.characters,parts.reduce((sum,p)=>sum+p.text.length,0));assert.equal(estimate.estimatedTokens.exact,false);assert.ok(estimate.estimatedTokens.upper>=estimate.estimatedTokens.lower);
});
test('estimate rejects unavailable scope and respects cancellation',async()=>{
 await assert.rejects(estimateFulltext({patentIds:['FOREIGN'],version:'v1',signal:new AbortController().signal,read:async()=>undefined}),/无访问权限/);
 const control=new AbortController();control.abort();await assert.rejects(estimateFulltext({patentIds:['TEST'],version:'v1',signal:control.signal,read:async()=>{throw new Error('must not read');}}),{name:'AbortError'});
});
