import {test} from 'node:test';
import assert from 'node:assert/strict';
import {noveltyReportEvidence,partitionNoveltyEvidence} from '../src/server/novelty-report-input';
test('report context preserves every document and batch citation, omitting only duplicate full source',()=>{
 const documents=Array.from({length:30},(_,index)=>({patentId:'TEST-'+index,chunkCount:2,sourceChunks:[{text:'x'.repeat(4000)},{text:'y'.repeat(4000)}],batches:[{comparisons:[{featureId:'F1',evidence:[{quote:'逐字证据',start:2,end:6}]}]},{comparisons:[{featureId:'F2',evidence:[]}]}]}));
 const result=noveltyReportEvidence({featureRevision:3,documents});
 assert.equal(result.documents.length,30);
 for(let i=0;i<documents.length;i++){assert.deepEqual(result.documents[i].batches,documents[i].batches);assert.equal('sourceChunks' in result.documents[i],false);assert.equal(result.documents[i].sourceCoverage.savedChunks,2);}
 assert.equal(result.featureRevision,3);
 assert.ok(JSON.stringify(result).length<JSON.stringify({documents}).length/5);
});
test('partitioned report retains every batch and document without first-row truncation',()=>{
 const documents=Array.from({length:12},(_,i)=>({patentId:'TEST-'+i,chunkCount:3,sourceChunks:[1,2,3],batches:Array.from({length:3},(_,j)=>({id:i+'-'+j,explanation:'x'.repeat(500)}))}));
 const parts=partitionNoveltyEvidence(noveltyReportEvidence({documents}),2000);
 assert.ok(parts.length>1);
 assert.deepEqual(parts.flatMap(part=>part.documents.flatMap(document=>document.batches)),documents.flatMap(document=>document.batches));
 assert.equal(new Set(parts.flatMap(part=>part.documents.map(document=>document.patentId))).size,12);
});
