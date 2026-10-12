import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseMineruCloud,type MineruCheckpoint} from '../src/server/mineru-cloud';
import {mineruContentPages} from '../src/server/mineru-pdf';
test('MinerU content preserves original selected page numbers, tables and formulas',()=>{
 const pages=mineruContentPages([{page_idx:0,type:'text',text:'技术方案'},{page_idx:1,type:'table',table_body:'<table><tr><td>A</td></tr></table>'},{page_idx:1,type:'equation',text:'E=mc^2'}],[3,8]);
 assert.equal(pages[0].page,3);assert.equal(pages[1].page,8);assert.match(pages[1].text,/<table>/);assert.match(pages[1].text,/\$\$\nE=mc\^2/);assert.equal(pages[0].meanWordConfidence,null);
 assert.throws(()=>mineruContentPages([{page_idx:2,text:'bad'}],[1]),/页码/);
 assert.throws(()=>mineruContentPages({},[1]),/逐页内容/);
});
test('MinerU persists upload state and resumes polling without uploading again',async()=>{
 const previous=process.env.PATENT_MINERU_API_KEY;process.env.PATENT_MINERU_API_KEY='synthetic-test-key';
 try{
  const saves:(MineruCheckpoint|null)[]=[],calls:string[]=[];
  const request=(async(url: string|URL|Request)=>{calls.push(String(url));return Response.json(String(url).endsWith('/file-urls/batch')?{code:0,data:{batch_id:'batch',file_urls:['https://upload.test/file']}}:String(url).includes('upload.test')?{}:{code:0,data:{extract_result:[{state:'done',markdown:'$x^2$ <table></table>'}]}});}) as typeof fetch;
  const options={fetch:request,save:async(value:MineruCheckpoint|null)=>{saves.push(value);}};
  assert.equal((await parseMineruCloud(Buffer.from('pdf'),'test.pdf',options)).markdown,'$x^2$ <table></table>');
  assert.deepEqual(saves,[{batchId:'batch',uploadUrl:'https://upload.test/file',uploaded:false},{batchId:'batch',uploaded:true}]);
  calls.length=0;await parseMineruCloud(Buffer.from('pdf'),'test.pdf',{...options,checkpoint:saves[1]!});
  assert.equal(calls.length,1);assert.match(calls[0],/extract-results/);
 }finally{if(previous===undefined)delete process.env.PATENT_MINERU_API_KEY;else process.env.PATENT_MINERU_API_KEY=previous;}
});
test('MinerU terminal failure clears checkpoint; missing output is not successful OCR',async()=>{
 const previous=process.env.PATENT_MINERU_API_KEY;process.env.PATENT_MINERU_API_KEY='synthetic-test-key';
 try{
  let cleared=false;
  for(const state of ['failed','done'])await assert.rejects(parseMineruCloud(Buffer.from('pdf'),'test.pdf',{checkpoint:{batchId:'batch',uploaded:true},save:async value=>{cleared=value===null;},fetch:(async()=>Response.json({code:0,data:{extract_result:{state}}})) as typeof fetch}),state==='failed'?/解析失败/:/未提供解析结果/);
  assert.ok(cleared);
 }finally{if(previous===undefined)delete process.env.PATENT_MINERU_API_KEY;else process.env.PATENT_MINERU_API_KEY=previous;}
});
