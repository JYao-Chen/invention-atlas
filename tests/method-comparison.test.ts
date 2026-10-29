import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {AnalysisResult,Patent} from '../src/lib/types';
import {bm25Index,ipcMainGroup,rankingMetrics,rrf,stratifiedFolds,stratifiedSplit,textRank,yake} from '../src/server/comparison-algorithms';
import {classificationMetrics,evaluateClassification,selectClassification} from '../src/server/comparison-classification';
import {compareClassification,compareRetrieval,isGranted} from '../src/server/method-comparison';
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

test('BM25 matches hand calculation, tunable length normalization, excludes self and breaks ties by ID',()=>{
 const records=[make('A','sensor sensor'),make('B','sensor camera')].map(p=>({...p,abstract:''}));
 const search=bm25Index(records),hits=search('sensor');
 assert.equal(hits[0].patent,'A');near(hits[0].score,Math.log(1+.5/2.5)*2*2.2/(2+1.2));
 assert.deepEqual(hits,search('sensor'));assert.deepEqual(search('nothing'),[]);assert.deepEqual(search('sensor','A').map(h=>h.patent),['B']);
 const long=[make('A','sensor'),make('B','sensor camera camera camera')].map(p=>({...p,abstract:''}));
 near(bm25Index(long,1.2,0)('sensor')[0].score,bm25Index(long,1.2,0)('sensor')[1].score);
 assert.ok(bm25Index(long,1.2,1)('sensor')[0].score>bm25Index(long,1.2,1)('sensor')[1].score);
});

test('RRF combines ranks rather than incompatible scores and never duplicates an ID',()=>{
 const a=[{patent:'A',score:100},{patent:'B',score:1}],b=[{patent:'B',score:.9},{patent:'C',score:.8}];
 const fused=rrf([a,b],60);assert.deepEqual(fused.map(h=>h.patent),['B','A','C']);near(fused[0].score,1/62+1/61);
 assert.deepEqual(rrf([a,b]),rrf([a,b]));assert.equal(rrf([[a[0],a[0]]])[0].score,1/61);assert.deepEqual(rrf([]),[]);
});

test('P@k, recall and binary nDCG agree with hand examples and do not invent no-positive scores',()=>{
 const hits=['A','X','B'].map(patent=>({patent,score:1})),positive=new Set(['A','B','C']);
 const m=rankingMetrics(hits,positive,3);near(m.precision,2/3);near(m.recall!,2/3);near(m.ndcg!,1.5/(1+1/Math.log2(3)+.5));
 assert.equal(rankingMetrics(hits,positive,5).precision,2/5);
 assert.deepEqual(rankingMetrics(hits,new Set(),5),{precision:0,recall:null,ndcg:null});
});

test('IPC main groups normalize spaces/subgroups and the first label alone controls classification',()=>{
 assert.equal(ipcMainGroup(' G06F 0016/035 '),'G06F16/00');assert.equal(ipcMainGroup('G06F'),'');
 assert.equal(ipcMainGroup('invalid'),'');
 const altered=fixtures.map(p=>({...p,ipc:['invalid',p.ipc[0]]}));
 assert.equal(compareClassification(altered,{}).status,'unavailable');
 assert.equal(isGranted({...fixtures[0],id:'US100A1',legalStatus:'active'}),false);
});

test('stratified split and CV reproduce across input order, preserve classes and isolate holdout',()=>{
 const split=stratifiedSplit(fixtures,.7,42),reversed=stratifiedSplit(fixtures.slice().reverse(),.7,42);
 assert.deepEqual(split,reversed);assert.equal(split.development.length,24);assert.equal(split.holdout.length,12);
 assert.notDeepEqual(split.holdout.map(p=>p.id),stratifiedSplit(fixtures,.7,43).holdout.map(p=>p.id));
 const holdoutIds=new Set(split.holdout.map(p=>p.id));assert.ok(split.development.every(p=>!holdoutIds.has(p.id)));
 const folds=stratifiedFolds(split.development,3,42);assert.equal(new Set(folds.flat().map(p=>p.id)).size,24);
 for(const fold of folds){assert.equal(new Set(fold.map(p=>p.ipc[0])).size,3);assert.ok(fold.every(p=>!holdoutIds.has(p.id)));}
});

test('selection uses development only; poisoning holdout changes scores but cannot change selected k or CV',()=>{
 const {development,holdout}=stratifiedSplit(fixtures);
 const options={candidates:[1,3,5],folds:3,seed:42,k1:1.2,b:.75};
 for(const method of ['knn','nearest_centroid','bm25_vote'] as const){
  const selected=selectClassification(development,method,options),cv=structuredClone(selected.cv),k=selected.neighbor_k;
  assert.ok(selected.folds.flat().every(id=>!holdout.some(p=>p.id===id)));
  const evaluated=evaluateClassification(selected,holdout);assert.equal(evaluated.metrics.accuracy,1);
  // Poisoning labels and content occurs only after selection; no retuning API accepts this data.
  const poisoned=holdout.map(p=>({...p,ipc:[codes[(codes.indexOf(p.ipc[0])+1)%3]],title:'unseen',abstract:'unseen',embedding:[.1,.1,.1]}));
  assert.notEqual(evaluateClassification(selected,poisoned).metrics.accuracy,1);
  assert.equal(selected.neighbor_k,k);assert.deepEqual(selected.cv,cv);
  assert.throws(()=>evaluateClassification(selected,development),/重叠/);
 }
});

test('classification macro F1 and top3 use all declared labels and count abstentions as errors',()=>{
 const predictions=[{patent:'A',actual_label:'a',predicted_label:'a',top_labels:['a'],neighbors:[]},{patent:'B',actual_label:'b',predicted_label:'a',top_labels:['a','b'],neighbors:[]},{patent:'C',actual_label:'b',predicted_label:null,top_labels:[],neighbors:[]}];
 const m=classificationMetrics(predictions,['a','b']);near(m.accuracy!,1/3);near(m.macro_f1!,1/3);near(m.top3_accuracy!,2/3);
});

test('runner completes selection before checking holdout embeddings and does not retune on missing holdout',()=>{
 const holdout=new Set(stratifiedSplit(fixtures).holdout.map(p=>p.id)),baseline=compareClassification(fixtures,{});
 const changed=compareClassification(fixtures.map(p=>holdout.has(p.id)?{...p,embedding:undefined}:p),{});
 for(const original of runs(baseline)){
  const updated=runs(changed).find(r=>r.method_name===original.method_name)!;
  assert.deepEqual(updated.cv_scores,original.cv_scores);assert.deepEqual(updated.parameters,original.parameters);
  if(original.method_name!=='bm25_vote'){assert.equal(updated.sample_size,0);assert.equal(updated.accuracy,null);}
 }
});

test('retrieval reports both relevance pools, citation coverage, fixed queries and self exclusion',()=>{
 const result=compareRetrieval(fixtures,{query_count:8,seed:9});assert.equal(runs(result).length,12);
 for(const row of result.rows.filter(r=>r.type==='retrieval_query'))assert.ok(!(row.patents as string[]).includes(row.query_patent as string));
 const first=runs(result)[0];assert.equal(first.citation_coverage,33/36);assert.equal(first.internal_citation_coverage,1);
 assert.equal(first.sample_size,8);assert.equal(first.evaluated_queries,8);
 assert.deepEqual(first.query_ids,runs(compareRetrieval(fixtures.slice().reverse(),{query_count:8,seed:9}))[0].query_ids);
 const query=result.rows.find(r=>r.type==='retrieval_query')!;const p=fixtures.find(p=>p.id===query.query_patent)!;
 const relevant=fixtures.filter(other=>other.id!==p.id&&(p.citations.includes(other.id)||other.citations.includes(p.id))).map(p=>p.id).sort();
 assert.deepEqual(query.strong_relevant,relevant);assert.equal((query.weak_relevant as string[]).length,11);
 assert.match(result.warnings.join(' '),/伪标注，非人工评判；引用覆盖率不足时查全率被低估/);
});

test('missing embeddings/citations degrade to BM25 with null citation metrics, never network calls',async()=>{
 const records=fixtures.map(p=>({...p,embedding:undefined,citations:[]}));
 const meta=datasetMeta('MISSING FIELDS FIXTURE',records,'unit','unit');
 const retrieval=await executeTool('compare_retrieval_methods',{query_count:4},meta,records);
 assert.ok(runs(retrieval).filter(r=>r.method_name==='bm25'&&r.basis==='ipc').every(r=>Number(r.ndcg)>0));
 assert.ok(runs(retrieval).filter(r=>r.basis==='citation').every(r=>r.ndcg===null));
 assert.ok(runs(retrieval).filter(r=>r.method_name==='vector'||r.method_name==='rrf').every(r=>r.sample_size===0));
 assert.match(retrieval.warnings.join(' '),/嵌入缺失/);assert.match(retrieval.warnings.join(' '),/缺少引用/);
 const classification=await executeTool('compare_classification_methods',{},meta,records);assert.equal(runs(classification).find(r=>r.method_name==='bm25_vote')!.accuracy,1);
 assert.ok(runs(classification).filter(r=>r.method_name!=='bm25_vote').every(r=>r.status==='unavailable'));
 assert.match(classification.warnings.join(' '),/嵌入缺失/);
});

test('partial and incompatible vectors expose actual evaluation cohorts without fabricating results',()=>{
 const partial=fixtures.map((p,i)=>({...p,embedding:i%5? p.embedding:undefined}));
 const classification=compareClassification(partial,{}),bm=runs(classification).find(r=>r.method_name==='bm25_vote')!,knn=runs(classification).find(r=>r.method_name==='knn')!;
 assert.ok(Number(knn.sample_size)<Number(bm.sample_size));
 assert.ok((knn.data_range as {excluded_holdout_ids:string[]}).excluded_holdout_ids.length);
 const mixed=fixtures.map((p,i)=>({...p,embedding:i===0?[1,0]:p.embedding}));
 const retrieval=compareRetrieval(mixed,{query_count:4});assert.match(retrieval.warnings.join(' '),/维度不一致/);
 assert.equal(runs(retrieval).find(r=>r.method_name==='vector')!.sample_size,0);
});

test('three registered tools execute, preserve contracts, persist and read back without external APIs',async()=>{
 const meta=datasetMeta('SYNTHETIC METHOD COMPARISON',fixtures,'unit','unit');
 await store.saveDataset(meta,fixtures);
 const originalFetch=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;throw new Error('External API forbidden in comparison');};
 try{
  for(const name of ['compare_keyword_methods','compare_retrieval_methods','compare_classification_methods']){
   assert.ok(TOOL_DEFS.some(d=>d[0]===name));
   const result=await executeTool(name,{top_k:3,query_count:4},meta,fixtures);
   assert.equal(result.status,'completed');assert.ok(result.chart);assert.ok(result.summary);assert.ok(result.method);assert.ok(result.evidence.length);
   for(const run of runs(result))for(const key of ['method_name','parameters','data_range','seed','metrics','elapsed_ms','sample_size'])assert.ok(key in run);
   for(const field of resultContract(result).fields)assert.ok(field.name in fieldDefinitions,field.name);
   if(name==='compare_keyword_methods'){
    assert.equal(result.rows.filter(r=>r.type==='keyword').length,9);assert.equal(result.rows.filter(r=>r.type==='keyword_overlap').length,3);
   }
   if(name==='compare_classification_methods'){
    assert.equal(runs(result).length,3);assert.ok(runs(result).every(r=>r.accuracy===1));
    for(const row of result.rows.filter(r=>r.type==='classification_prediction')){
     const run=runs(result).find(r=>r.method_name===row.method_name)!,scope=run.data_range as {development_ids:string[];holdout_ids:string[]};
     assert.ok(scope.holdout_ids.includes(String(row.patent)));assert.ok((row.neighbors as {patent:string;score:number}[]).every(n=>scope.development_ids.includes(n.patent)&&Number.isFinite(n.score)));
    }
   }
   await store.saveResult(result);const saved=(await store.savedResult(result.id))!;
   assert.deepEqual(saved.rows,result.rows);assert.equal(readResult(saved,{limit:2}).rows?.length,2);
   const empty=await executeTool(name,{year_start:2099},meta,fixtures);assert.equal(empty.status,'unavailable');
  }
  assert.equal(calls,0);
 }finally{globalThis.fetch=originalFetch;}
});

test('new parameters are validated and exposed through the backend/OpenAPI catalog',()=>{
 const params={seed:0,query_count:5,bm25_k1:2,bm25_b:0,rrf_constant:10,min_class_size:3,development_ratio:.8,cv_folds:2,k_candidates:[1,3]};
 assert.deepEqual(paramsSchema.parse(params),params);
 for(const invalid of [{seed:-1},{query_count:0},{bm25_b:1.1},{bm25_k1:0},{k_candidates:[]},{k_candidates:[1.5]},{min_class_size:2},{development_ratio:1},{cv_folds:1}])assert.throws(()=>paramsSchema.parse(invalid));
 const schema=toolInputSchema('compare_classification_methods');assert.equal(schema.properties.k_candidates.type,'array');assert.equal(schema.properties.development_ratio.type,'number');
 assert.match(toolInformation('compare_classification_methods').parameters.k_candidates!,/开发集/);
 const route=openApiDocument().paths['/tools/compare_classification_methods'] as {post:{description:string}};
 assert.match(route.post.description,/不调用模型或嵌入API/);
});
