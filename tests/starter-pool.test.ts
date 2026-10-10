import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
process.env.PATENT_DATA_DIR=mkdtempSync(join(tmpdir(),'patent-starter-pool-'));
const {normalize,datasetMeta}=await import('../src/server/importers');
const {saveDataset,updateDataset,setting}=await import('../src/server/db');
const {readyStarterPool,warmStarterPool}=await import('../src/server/starter-pool');
const records=Array.from({length:40},(_,i)=>normalize({id:`US${800000+i}B1`,title:'Distributed network ledger',abstract:'Secure transactions',applicants:['Example'],publication_date:`202${i%4}-01-01`,ipc:['H04L9/00'],claims:[{number:1,text:'A network system.'}],description:'A network description.'},'UNIT TEST ONLY'));
const meta=datasetMeta('UNIT TEST ONLY',records,'test','test only');saveDataset(meta,records);
test('three ready batches persist and consumption immediately replenishes the stock',()=>{
 const first=readyStarterPool(meta.id);assert.equal(first.batches.length,3);assert.ok(first.batches.every(b=>b.items.length===4));assert.deepEqual(readyStarterPool(meta.id),first);
 const consumed=first.batches.slice(0,2).map(b=>b.id);const next=readyStarterPool(meta.id,consumed);assert.equal(next.batches.length,3);assert.equal(next.batches[0].id,first.batches[2].id);assert.ok(next.batches.every(b=>!consumed.includes(b.id)));
});
test('background generation never blocks ready batches and concurrent warming shares one job',async()=>{
 let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);let calls=0;
 const generator:typeof import('../src/server/starters').generateStarters=async(_r,_id,_prev,_receive,_signal,_write,prepared)=>{calls++;await gate;return {items:prepared!,generated:true};};
 const work=warmStarterPool(meta.id,generator);assert.equal(warmStarterPool(meta.id,generator),work);assert.equal(readyStarterPool(meta.id).batches.length,3);release();await work;assert.equal(calls,3);assert.ok(readyStarterPool(meta.id).batches.every(b=>b.generated));
});
test('record changes invalidate cached parameters, and an old job cannot repopulate them',async()=>{
 updateDataset(meta);const old=readyStarterPool(meta.id);let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
 const work=warmStarterPool(meta.id,async(_r,_id,_prev,_receive,_signal,_write,prepared)=>{await gate;return {items:prepared!,generated:true};});await new Promise(resolve=>setImmediate(resolve));updateDataset(meta);assert.equal(setting('starter-pool:'+meta.id),undefined);const fresh=readyStarterPool(meta.id);assert.notEqual(fresh.version,old.version);release();await work;assert.deepEqual(readyStarterPool(meta.id),fresh);
});
