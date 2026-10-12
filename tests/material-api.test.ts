import {test} from 'node:test';
import assert from 'node:assert/strict';
import {materialEndpoint} from '../src/server/material-api';
test('material API preserves filenames and bytes, pagination and soft-removal semantics',async()=>{
 let restored=false;const bytes=Buffer.from('原文件\n第二段'),store={list:async(offset:number)=>{assert.equal(offset,50);return [];},create:async(file:File)=>({id:'A',filename:file.name}),read:async()=>({id:'A'}),original:async()=>({filename:'技术方案.txt',format:'txt',bytes}),remove:async()=>({ok:true,retainedOriginal:true}),restore:async()=>{restored=true;return {ok:true};}};
 const download=await materialEndpoint(new Request('http://local/api/materials/A/original'),['materials','A','original'],store);assert.equal(Buffer.from(await download.arrayBuffer()).toString(),bytes.toString());assert.ok(download.headers.get('Content-Disposition')!.includes(encodeURIComponent('技术方案.txt')));assert.equal(download.headers.get('Cache-Control'),'no-store');
 const list=await materialEndpoint(new Request('http://local/api/materials?offset=50'),['materials'],store);assert.equal((await list.json()).nextOffset,null);
 const removed=await materialEndpoint(new Request('http://local/api/materials/A',{method:'DELETE'}),['materials','A'],store);assert.equal((await removed.json()).retainedOriginal,true);
 await materialEndpoint(new Request('http://local/api/materials/A',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'restore'})}),['materials','A'],store);assert.equal(restored,true);
 const form=new FormData();form.append('file',new File(['content'],'upload.txt'));const uploaded=await materialEndpoint(new Request('http://local/api/materials',{method:'POST',body:form}),['materials'],store);assert.equal(uploaded.status,201);
});
