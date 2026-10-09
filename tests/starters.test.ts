import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
process.env.PATENT_DATA_DIR=mkdtempSync(join(tmpdir(),'patent-starters-'));
const {starterCandidates,generateStarters}=await import('../src/server/starters');
const {normalize}=await import('../src/server/importers');
const {stepSchema}=await import('../src/server/planning');
const {scope}=await import('../src/server/tools');
const records=Array.from({length:40},(_,i)=>normalize({id:`US${900000+i}B1`,title:'Blockchain authentication',abstract:'Encrypted network authentication',applicants:['Example'],publication_date:`202${i%4}-01-01`,ipc:['H04L9/00'],claims:[{number:1,text:'A method comprising authentication.'}],description:'A description of authentication.'},'UNIT TEST ONLY'));
test('starter questions bind valid tools, real identifiers and nonempty statistical ranges',()=>{
 for(let seed=1;seed<=20;seed++){let state=seed;const random=()=>((state=state*16807%2147483647)/2147483647);const items=starterCandidates(records,'d',[],random);assert.equal(items.length,4);assert.equal(new Set(items.map(i=>i.name)).size,4);
 for(const item of items){assert.equal(item.datasetId,'d');assert.ok(stepSchema.safeParse({tool:item.name,params:item.params}).success);assert.ok(scope(records,item.params).length);assert.ok(item.params.patent_numbers?.every(id=>records.some(p=>p.id===id))??true);assert.notEqual(item.name,'search_patents');assert.notEqual(item.name,'analyze_clustering');assert.notEqual(item.name,'analyze_legal_status');}
 }
 assert.deepEqual(starterCandidates([],'empty'),[]);
});
test('changing a batch avoids the preceding tool choices when enough candidates exist',()=>{
 const first=starterCandidates(records,'d',[],()=>0.5),second=starterCandidates(records,'d',first.map(i=>i.name),()=>0.5);assert.ok(second.every(i=>!first.some(p=>p.name===i.name)));
});
test('model questions arrive line by line without changing their executable parameters',async()=>{
 const snapshots:unknown[]=[];const result=await generateStarters(records,'d',[],items=>snapshots.push(structuredClone(items)),undefined,async(_instruction,context,opts)=>{
  const selected=JSON.parse(context);for(const row of selected){const line=JSON.stringify({index:row.index,question:'请'+row.example});opts?.onDelta?.(line.slice(0,10));opts?.onDelta?.(line.slice(10)+'\n');}return '';
 });assert.equal(result.generated,true);assert.equal(snapshots.length,5);assert.ok(result.items.every(i=>i.question.startsWith('请')));
});
test('a failed model leaves usable targeted questions rather than an empty recommendation panel',async()=>{
 const result=await generateStarters(records,'d',[],()=>{},undefined,async()=>{throw new Error('Unavailable');});assert.equal(result.generated,false);assert.equal(result.items.length,4);assert.ok(result.items.every(i=>stepSchema.safeParse({tool:i.name,params:i.params}).success));
});
test('a bound starter plan saves effective defaults and audits its actual execution',async()=>{
 const {datasetMeta}=await import('../src/server/importers');const {saveDataset,newConversation,run}=await import('../src/server/db');const {startRun}=await import('../src/server/agent');
 const meta=datasetMeta('UNIT TEST ONLY',records,'test','test only');saveDataset(meta,records);const c=newConversation(meta.id);const task=startRun(c.id,meta.id,'统计这批专利的公开局分布',[{tool:'analyze_country_distribution',params:{}}],true);
 for(let i=0;i<100;i++){const current=run(task.id)!;if(current.status!=='running'){assert.equal(current.status,'completed');assert.equal(current.audit?.[0].status,'completed');assert.equal(current.plan[0].params.top_k,20);assert.deepEqual(current.plan[0].params,current.results[0].params);return;}await new Promise(resolve=>setTimeout(resolve,10));}assert.fail('工具执行未完成');
});
