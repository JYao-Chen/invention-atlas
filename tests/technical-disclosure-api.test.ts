import {test} from 'node:test';
import assert from 'node:assert/strict';
import {disclosureEndpoint} from '../src/server/technical-disclosure-api';
test('disclosure endpoint pins downloads to the requested saved revision and rejects incomplete drafts',async()=>{
 const reads:unknown[]=[];
 const store={list:async()=>[],create:async()=>({}),update:async()=>({}),remove:async()=>{},read:async(id:string,revision?:number)=>{reads.push([id,revision]);return {id,revision:revision||2,snapshot:{draft:revision===1?null:{markdown:'# Saved version 2'},questions:[{field:'problem'}]}};}} as any;
 const download=await disclosureEndpoint(new Request('http://local/api/disclosures/A/markdown?revision=2'),['disclosures','A','markdown'],store);
 assert.equal(download.status,200);assert.equal(await download.text(),'# Saved version 2');
 assert.match(download.headers.get('Content-Disposition')!,/v2.md/);
 assert.equal(download.headers.get('Cache-Control'),'no-store');
 const incomplete=await disclosureEndpoint(new Request('http://local/api/disclosures/A/markdown?revision=1'),['disclosures','A','markdown'],store);
 assert.equal(incomplete.status,409);assert.equal((await incomplete.json()).questions[0].field,'problem');
 assert.deepEqual(reads,[['A',2],['A',1]]);
 const unsupported=await disclosureEndpoint(new Request('http://local/api/disclosures/A/markdown',{method:'DELETE'}),['disclosures','A','markdown'],store);
 assert.equal(unsupported.status,405);
 await assert.rejects(disclosureEndpoint(new Request('http://local/api/disclosures/A?revision=0'),['disclosures','A'],store));
});
test('material multipart extraction is an unsaved preview and does not invoke the disclosure store',async()=>{
 const store=new Proxy({}, {get(){throw new Error('材料预览不应写入或读取交底');}}) as any;
 const form=new FormData();form.append('file',new File(['方案原文\n第二段'],'方案.txt'));
 const response=await disclosureEndpoint(new Request('http://local/api/disclosures/extract',{method:'POST',body:form}),['disclosures','extract'],store);
 assert.equal(response.status,200);const data=await response.json();assert.equal(data.text,'方案原文\n第二段');assert.equal(data.saved,false);assert.equal(response.headers.get('Cache-Control'),'no-store');
});
