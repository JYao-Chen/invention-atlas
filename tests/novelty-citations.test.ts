import {test} from 'node:test';
import assert from 'node:assert/strict';
import {numberedNoveltyCitations,resolveNoveltyCitations,noveltyCitationStream,noveltyCitationWritingInput} from '../src/server/novelty-citations';
test('layout source sections retain their actual origin rather than defaulting to abstract',()=>{
 const cases=[['claims','权利要求全文'],['description','说明书'],['abstract','摘要'],['Background/Summary','背景与概要'],['Description','说明书'],['Detailed Description','说明书'],['custom source field','custom source field']];
 for(const [section,label] of cases){
  const rendered=resolveNoveltyCitations('[[evidence:E1]]',[{citationId:'E1',patentId:'TEST',documentVersion:'v1',section,start:3,end:5,quote:'原文'}]);
  assert.ok(rendered.includes(`· ${label} · 原文位置 3—5`));
  assert.ok(rendered.includes('> 原文'));
 }
 const claim=resolveNoveltyCitations('[[evidence:E1]]',[{citationId:'E1',patentId:'TEST',documentVersion:'v1',section:'claim',claimNumber:4,start:0,end:2,quote:'原文'}]);
 assert.ok(claim.includes('· 权利要求 4 ·'));
});
test('report citations insert stored original text and exact source metadata',()=>{
 const reference={patentId:'TEST-ONLY',documentVersion:'v1',section:'description',start:12,end:23,quote:'第一行原文\n第二行原文'};
 const {comparison,citations}=numberedNoveltyCitations({documents:[{patentId:'TEST-ONLY',batches:[{comparisons:[{featureId:'F1',evidence:[reference]}]}]}]});
 assert.equal(comparison.documents[0].batches[0].comparisons[0].evidence[0].citationId,'E1');
 const writing=noveltyCitationWritingInput(comparison);
 assert.equal('quote' in writing.documents[0].batches[0].comparisons[0].evidence[0],false);
 assert.equal(writing.documents[0].batches[0].comparisons[0].evidence[0].citationId,'E1');
 assert.equal(citations[0].quote,reference.quote);
 const rendered=resolveNoveltyCitations('技术对应说明 [[evidence:E1]]',citations);
 assert.match(rendered,/> 第一行原文\n> 第二行原文/);assert.match(rendered,/TEST-ONLY.*12—23/);
 assert.throws(()=>resolveNoveltyCitations('[[evidence:E2]]',citations),/不存在/);
 assert.throws(()=>resolveNoveltyCitations('[[evidence:E1]',citations),/不完整/);
 assert.throws(()=>resolveNoveltyCitations('[[evidence:E1]] [[evidence:E1,E2]]',citations),/不完整：\[\[evidence:E1,E2\]\]/);
});
test('stream resolves references split across deltas without losing ordinary text',async()=>{
 const reference={patentId:'TEST',documentVersion:'v1',section:'abstract',start:0,end:2,quote:'原文',citationId:'E1'};
 let output='';const stream=noveltyCitationStream([reference],async text=>{output+=text;});
 for(const part of ['正文 [','[ev','idence:E','1]] 后文'])await stream.push(part);
 await stream.finish();assert.equal(output,resolveNoveltyCitations('正文 [[evidence:E1]] 后文',[reference]));
 const invalid=noveltyCitationStream([reference],async()=>{});await invalid.push('[[evidence:E1');await assert.rejects(invalid.finish(),/不完整/);
 const fabricated=noveltyCitationStream([reference],async()=>{});await fabricated.push('> 模型改写的引文');await assert.rejects(fabricated.finish(),/自行编写/);
 const formatted=noveltyCitationStream([reference],async()=>{});await formatted.push('> [[evidence:E1]]\n> ');await formatted.finish();
});
