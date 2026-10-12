import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evidenceFromSelection} from '../src/lib/comparison-evidence';
test('manual source selections preserve immutable field positions and exact text',()=>{
 const source={patentId:'TEST',documentVersion:'v2',section:'claim',claimNumber:2,start:50,end:64,text:'node validates',ordinal:1};
 const reference=evidenceFromSelection(source,5,14);
 assert.equal(reference.quote,'validates');assert.equal(reference.start,55);assert.equal(reference.end,64);assert.equal(reference.documentVersion,'v2');assert.equal(reference.claimNumber,2);
 for(const [start,end] of [[0,0],[-1,4],[0,15],[0.5,3]])assert.throws(()=>evidenceFromSelection(source,start,end),/选择非空文本/);
});
