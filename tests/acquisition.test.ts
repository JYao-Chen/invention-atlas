import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
process.env.PATENT_DATA_DIR=mkdtempSync(join(tmpdir(),'patent-acquisition-'));
const {readDltWindow}=await import('../src/server/acquisition');
test('source windows use configured transport but keep dataset and pagination',async()=>{
 process.env.PATENT_DATASET_ROWS_URL='http://127.0.0.1:18082/rows';
 try{await readDltWindow(10000,new AbortController().signal,(async url=>{const actual=new URL(String(url));assert.equal(actual.origin,'http://127.0.0.1:18082');assert.equal(actual.searchParams.get('offset'),'10000');assert.equal(actual.searchParams.get('length'),'100');assert.equal(actual.searchParams.get('dataset'),'ExponentialScience/DLT-Patents');return Response.json({rows:[]});}) as typeof fetch);}finally{delete process.env.PATENT_DATASET_ROWS_URL;}
});
test('temporary upstream errors retry once; network failures explain recovery',async()=>{
 let calls=0;const data=await readDltWindow(0,new AbortController().signal,(async()=>++calls===1?new Response('upstream',{status:502}):Response.json({rows:[]})) as typeof fetch);assert.equal(calls,2);assert.deepEqual(data.rows,[]);
 await assert.rejects(readDltWindow(0,new AbortController().signal,(async()=>{throw new TypeError('fetch failed');}) as typeof fetch),/服务器无法连接公开数据源/);
 await assert.rejects(readDltWindow(0,new AbortController().signal,(async()=>Response.json({error:'bad'})) as typeof fetch),/未返回记录数组/);
});
test('user cancellation is not disguised as a network error',async()=>{
 const control=new AbortController();control.abort();await assert.rejects(readDltWindow(0,control.signal,(async()=>{throw new TypeError('fetch failed');}) as typeof fetch),{name:'AbortError'});
});
