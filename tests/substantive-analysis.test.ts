import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
process.env.PATENT_DATA_DIR=mkdtempSync(join(tmpdir(),'patent-substantive-'));
const {normalize}=await import('../src/server/importers');
const {citationMainPaths,citationScreening,extractEffects,sourceChunks}=await import('../src/server/substantive-analysis');
const patents=['US100B1','US200B1','US300B1','US400B1'].map((id,i)=>normalize({id,title:id,publication_date:`202${i}-01-01`,abstract:'A sensor reduces power consumption.',citations:[[],['US100B1'],['US100B1'],['US200B1','US300B1']][i]},'UNIT TEST ONLY'));
test('SPC counts diamond paths exactly; each selected edge exists in source',()=>{
 const r=citationMainPaths(patents);assert.equal(r.rows.length,4);assert.ok(r.rows.every(row=>row.search_path_count==='1'));assert.equal(r.paths.length,1);assert.equal(r.paths[0].length,3);
 const extended=[...patents,normalize({id:'US500B1',publication_date:'2024-01-01',citations:['US100B1']},'TEST')];
 const edges=citationMainPaths(extended).rows;assert.equal(edges.filter(row=>row.source==='US100B1').length,3);
 for(const row of r.rows)assert.ok(patents.find(p=>p.id===row.target)!.citations.includes(String(row.source)));
});
test('SPC weights shared trunk by number of complete paths, no invented time edges',()=>{
 const records=patents.map(p=>({...p,citations:p.id==='US200B1'?['US100B1']:p.id==='US300B1'?['US200B1']:p.citations}));
 const r=citationMainPaths(records);assert.equal(r.rows.find(row=>row.source==='US100B1')!.search_path_count,'2');
 const invalid=citationMainPaths(patents.map(p=>({...p,citations:['US400B1']})));assert.equal(invalid.rows.length,0);assert.equal(invalid.rejected,4);
});
test('screening has no weighted value and adding claims cannot increase rank',()=>{
 const a=citationScreening(patents),b=citationScreening(patents.map(p=>({...p,claims:Array(100).fill({number:1,text:'claim'})})));
 assert.deepEqual(a.map(r=>[r.patent,r.pareto_front,r.pagerank]),b.map(r=>[r.patent,r.pareto_front,r.pagerank]));assert.ok(a.every(r=>!('score' in r)&&r.economic_value===null));
});
test('full source chunking covers final text and exact extraction offsets',async()=>{
 const p={...patents[0],description:'x'.repeat(35000)+' A sensor reduces power consumption.'};
 const chunks=sourceChunks(p);assert.ok(chunks.some(c=>c.text.endsWith('A sensor reduces power consumption.')));
 const rows=await extractEffects('test',[p],undefined,async text=>text.includes('A sensor reduces power consumption.')?[{technology:'传感器',effect:'降低功耗',quote:'A sensor reduces power consumption.'}]:[]);
 assert.equal(rows.length,2);for(const row of rows){const source=row.section==='abstract'?p.abstract:p.description;assert.equal(source.slice(Number(row.section_offset),Number(row.section_offset)+String(row.quote).length),row.quote);}
});
test('effect extraction rejects missing source evidence; zero relations are valid',async()=>{
 await assert.rejects(()=>extractEffects('test',patents,undefined,async()=>[{technology:'措施',effect:'效果',quote:'made up'}]),/不能定位/);
 assert.deepEqual(await extractEffects('test',patents,undefined,async()=>[]),[]);
 const controller=new AbortController();controller.abort();await assert.rejects(()=>extractEffects('test',patents,controller.signal,async()=>[]));
});
test('checkpoint resumes after cancellation, including empty successful chunks, without repeating calls',async()=>{
 const p={...patents[0],description:'z'.repeat(33000)},controller=new AbortController();let calls=0;
 const extract=async()=>{calls++;controller.abort();return [];};
 await assert.rejects(()=>extractEffects('resume-test',[p],controller.signal,extract,undefined,{cache:true}));assert.equal(calls,1);
 let reused=0;const count=sourceChunks(p).length;
 await extractEffects('resume-test',[p],undefined,async()=>{calls++;return [];},undefined,{cache:true,onCheckpoint:(_done,_total,n)=>reused=n});
 assert.equal(calls,count);assert.equal(reused,1);
 await extractEffects('resume-test',[p],undefined,async()=>{throw new Error('must not call');},undefined,{cache:true,onCheckpoint:(_done,_total,n)=>reused=n});assert.equal(reused,count);
 // A different dataset is independent even with the same publication number.
 let independent=0;await extractEffects('different-dataset',[p],undefined,async()=>{independent++;return [];},undefined,{cache:true});assert.equal(independent,count);
});
