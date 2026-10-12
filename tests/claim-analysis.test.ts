import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {extractClaimElements,claimEvidenceSpans} from '../src/server/claim-analysis';
import {store} from '../src/server/db';
import {normalize} from '../src/server/importers';
import {modelConfig} from '../src/server/config';
test('claim evidence spans preserve every character and prefer complete clauses and words',()=>{
 const text='Header: '+('longword '.repeat(70))+', another condition; last clause.\n',spans=claimEvidenceSpans(text);assert.equal(spans.map(span=>span.text).join(''),text);for(const span of spans){assert.equal(text.slice(span.start,span.end),span.text);assert.ok(span.text.length<=400);if(span.end<text.length)assert.ok(!(/[A-Za-z]/.test(text[span.end-1])&&/[A-Za-z]/.test(text[span.end])));}assert.equal(spans[0].text,'Header:');
});
test('element extraction filters split claim numbers and retains original-item offsets',async()=>{
 const datasetId=randomUUID(),text='**1**. A sensor.\n\n**2**. The sensor of claim 1 includes a valve.',patent=normalize({id:'US999007B1',claims:[{number:1,text,sourceStart:100,sourceEnd:100+text.length}]},'SYNTHETIC TEST ONLY');let calls=0;
 const request=async(_instruction:string,context:string)=>{calls++;assert.match(context,/\*\*2\*\*/);assert.doesNotMatch(context,/\*\*1\*\*/);return JSON.stringify({elements:[{element:'阀门',role:'部件',evidence_start:1,evidence_end:1}]});};
 try{
  await store.saveClaimCheckpoint(datasetId,patent.id,'claim-evidence-v2:'+modelConfig().model,1,0,[{element:'OLD MERGED CHECKPOINT'}]);
  const rows=await extractClaimElements(datasetId,[patent],[2],undefined,undefined,request);assert.equal(calls,1);assert.equal(rows.length,1);assert.equal(rows[0].claim,2);assert.deepEqual(rows[0].depends_on,[1]);assert.equal(rows[0].claim_structure_status,'dependent');assert.equal(rows[0].source_claim,1);assert.equal(rows[0].source_claim_offset,text.indexOf('**2**'));assert.equal(rows[0].source_offset,100+text.indexOf('**2**'));assert.equal(text.slice(Number(rows[0].source_claim_offset),Number(rows[0].source_claim_offset)+String(rows[0].quote).length),rows[0].quote);
  const cached=await extractClaimElements(datasetId,[patent],[2],undefined,undefined,async()=>{throw new Error('validated split checkpoint should be reused');});assert.deepEqual(cached,rows);
 }finally{await store.clearCheckpoints(datasetId,patent.id);}
});
