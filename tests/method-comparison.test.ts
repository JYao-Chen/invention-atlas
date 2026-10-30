import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {AnalysisResult,Patent} from '../src/lib/types';
import {textRank,yake} from '../src/server/comparison-algorithms';
import {executeTool,paramsSchema,TOOL_DEFS} from '../src/server/tools';
import {fieldDefinitions,readResult,resultContract,toolInformation} from '../src/server/result-contract';
import {datasetMeta,normalize} from '../src/server/importers';
import {openApiDocument,toolInputSchema} from '../src/server/openapi';
import {store} from '../src/server/db';

// Synthetic algorithm fixtures only; never loaded from a real patent database.
const make=(id:string,title:string,ipc='G06F16/35',embedding=[1,0,0]):Patent=>({...normalize({id,title,abstract:title,ipc:[ipc],legal_status:'Granted'},'SYNTHETIC METHOD COMPARISON'),embedding});
const terms=['sensor thermal camera','battery lithium electrode','optical laser photon'];
const codes=['G06F16/35','H01M10/52','G02B6/12'];
const fixtures=terms.flatMap((text,label)=>Array.from({length:12},(_,i)=>({...make(`US${label+1}${String(i).padStart(3,'0')}B1`,text,codes[label],[0,1,2].map(j=>j===label?1:0)),citations:i?[`US${label+1}${String(i-1).padStart(3,'0')}B1`]:[]})));
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
const runs=(result:{rows:AnalysisResult['rows']})=>result.rows.filter(r=>r.type==='comparison_run');

test('TextRank is deterministic, normalized and does not join independent patent windows',()=>{
 const records=[make('A','sensor camera sensor'),make('B','laser')];
 const a=textRank(records,2);assert.deepEqual(a,textRank(records,2));assert.deepEqual(a.map(r=>r.word),['camera','sensor','laser']);
 near(a.reduce((s,r)=>s+r.score,0),1);near(a[0].score,a[1].score);
 assert.deepEqual(textRank([make('A','sensor'),make('B','laser')],2),[{word:'laser',score:.5},{word:'sensor',score:.5}]);
 assert.deepEqual(textRank([make('A','the system and method')]),[]);
});

test('YAKE computes deterministic five-feature unigram scores with original casing',()=>{
 const scores=yake('sensor sensor camera');assert.deepEqual(scores,yake('sensor sensor camera'));assert.deepEqual(scores.map(s=>s.word),['camera','sensor']);const sensor=scores.find(s=>s.word==='sensor')!;
 // sensor: tf=2, mean=1.5, std=.5; left diversity=1, right=2/3, rel=8/3.
 near(sensor.features.frequency,1);near(sensor.features.relatedness,8/3);
 near(sensor.score,Math.log(Math.log(3))*32/9);near(scores[0].score,Math.log(Math.log(3))*25/24);
 assert.ok(yake('DNA DNA camera').find(s=>s.word==='dna')!.features.casing>0);
 assert.deepEqual(yake('the system and method'),[]);
});

test('keyword comparison executes, preserve contracts, persist and read back without external APIs',async()=>{
 const meta=datasetMeta('SYNTHETIC METHOD COMPARISON',fixtures,'unit','unit');
 await store.saveDataset(meta,fixtures);
 const originalFetch=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;throw new Error('External API forbidden in comparison');};
 try{
  for(const name of ['compare_keyword_methods']){
   assert.ok(TOOL_DEFS.some(d=>d[0]===name));
   const result=await executeTool(name,{top_k:3},meta,fixtures);
   assert.equal(result.status,'completed');assert.ok(result.chart);assert.ok(result.summary);assert.ok(result.method);assert.ok(result.evidence.length);
   for(const run of runs(result))for(const key of ['method_name','parameters','data_range','seed','metrics','elapsed_ms','sample_size'])assert.ok(key in run);
   for(const field of resultContract(result).fields)assert.ok(field.name in fieldDefinitions,field.name);
   if(name==='compare_keyword_methods'){
    assert.equal(result.rows.filter(r=>r.type==='keyword').length,9);assert.equal(result.rows.filter(r=>r.type==='keyword_overlap').length,3);
   }
   await store.saveResult(result);const saved=(await store.savedResult(result.id))!;
   assert.deepEqual(saved.rows,result.rows);assert.equal(readResult(saved,{limit:2}).rows?.length,2);
   const empty=await executeTool(name,{year_start:2099},meta,fixtures);assert.equal(empty.status,'unavailable');
  }
  assert.equal(calls,0);
 }finally{globalThis.fetch=originalFetch;}
});

test('removed method-evaluation tools are not registered and seed stays validated',()=>{
 for(const name of ['compare_retrieval_methods','compare_classification_methods']){assert.ok(!TOOL_DEFS.some(d=>d[0]===name));assert.equal(openApiDocument().paths['/tools/'+name],undefined);}
 assert.deepEqual(paramsSchema.parse({seed:0}),{seed:0});assert.throws(()=>paramsSchema.parse({seed:-1}));
 assert.equal(toolInputSchema('compare_keyword_methods').properties.seed.type,'integer');
 assert.match(toolInformation('compare_keyword_methods').parameters.seed!,/种子/);
});
