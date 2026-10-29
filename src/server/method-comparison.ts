import type {AnalysisResult,Params,Patent,Row} from '@/lib/types';
import {citationKey,keywordWeights,tokens} from './algorithms';
import {bm25Index,firstLabel,ipcMainGroup,patentText,rankingMetrics,rrf,seededShuffle,stratifiedSplit,textRank,vectorCohort,vectorRank,yake,type Hit} from './comparison-algorithms';
import {evaluateClassification,selectClassification,type ClassificationMethod,type SelectedClassification} from './comparison-classification';

type Output=Pick<AnalysisResult,'rows'|'summary'|'method'|'warnings'|'evidence'|'chart'|'status'>;
const average=(numbers:number[])=>numbers.length?numbers.reduce((a,b)=>a+b,0)/numbers.length:null;
const range=(records:Patent[])=>({patent_ids:records.map(p=>p.id),record_count:records.length,text_fields:['title','abstract']});
function output(method:string):Output{return {rows:[],summary:'',method,warnings:[],evidence:[],status:'completed'};}
const options=(p:Params)=>({seed:p.seed??42,k1:p.bm25_k1??1.2,b:p.bm25_b??.75});

export function compareKeywords(records:Patent[],params:Params):Output{
 records=records.slice().sort((a,b)=>a.id.localeCompare(b.id));
 const result=output('keyword-comparison-v1：既有TF-IDF、加权TextRank单词图、单文档YAKE五特征单词评分后语料聚合；英文分词及停用词复用tokens。');
 const top=params.top_k??20,seed=params.seed??42,lists=new Map<string,string[]>();
 const methods=[
  {name:'tfidf',parameters:{top_k:top},compute:()=>keywordWeights(records).map(r=>({word:r.word,score:r.tfidf}))},
  {name:'textrank',parameters:{top_k:top,window:4,damping:.85,max_iterations:100,tolerance:1e-8},compute:()=>textRank(records)},
  {name:'yake',parameters:{top_k:top,window:2,ngram:1,aggregation:'sum(1/(1+local_score))/N'},compute:()=>{
   const scores=new Map<string,number>();
   for(const p of records)for(const term of yake(patentText(p)))scores.set(term.word,(scores.get(term.word)||0)+1/(1+term.score)/records.length);
   return [...scores].map(([word,score])=>({word,score})).sort((a,b)=>b.score-a.score||a.word.localeCompare(b.word));
  }},
 ];
 const documents=new Map(records.map(p=>[p.id,new Set(tokens(patentText(p)))]));
 for(const method of methods){
  const start=performance.now(),keywords=method.compute().slice(0,top),elapsed=performance.now()-start;
  lists.set(method.name,keywords.map(k=>k.word));
  result.rows.push({type:'comparison_run',method_name:method.name,parameters:method.parameters,data_range:range(records),seed,metrics:{returned_keywords:keywords.length},elapsed_ms:elapsed,sample_size:records.length});
  keywords.forEach((keyword,i)=>{
   const ids=records.filter(p=>documents.get(p.id)!.has(keyword.word)).map(p=>p.id);
   result.rows.push({type:'keyword',method_name:method.name,rank:i+1,word:keyword.word,keyword_score:keyword.score,documents:ids.length,patents:ids.slice(0,3)});
  });
 }
 const names=[...lists.keys()];
 for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++){
  const a=new Set(lists.get(names[i])!),b=new Set(lists.get(names[j])!),union=new Set([...a,...b]),intersection=[...a].filter(w=>b.has(w)).length;
  result.rows.push({type:'keyword_overlap',method_name:names[i],other_method:names[j],intersection,union_size:union.size,jaccard:union.size?intersection/union.size:null});
 }
 result.chart={kind:'bar',x:'word',y:'keyword_score'};
 result.summary=`比较3种关键词方法，各返回最多${top}词及3组Jaccard重合度。`;
 result.warnings.push('关键词重合度是方法一致性，不是人工关键词准确率；三种分数尺度不同，不能按分数大小比较方法效果。','YAKE为英文单词版：逐专利计算五特征，按1/(1+局部分数)在语料内平均；未提取多词短语。');
 if(!lists.get('tfidf')?.length)result.warnings.push('标题与摘要没有可用英文词项，关键词为空。');
 result.evidence=[...new Set(result.rows.flatMap(r=>Array.isArray(r.patents)?r.patents as string[]:[]))];
 return result;
}

/** Grants only: explicit source status or publication kind B/C, not inferred from dates. */
export function isGranted(p:Patent){return /^(granted|grant|授权|已授权)$/i.test(p.legalStatus.trim())||/[BC]\d?$/.test(p.id);}

export function compareRetrieval(records:Patent[],params:Params):Output{
 records=records.slice().sort((a,b)=>a.id.localeCompare(b.id));
 const result=output('retrieval-comparison-v1：固定种子抽样授权件；标题+摘要BM25、自身已存嵌入余弦、两路完整排名RRF；所有方法排除查询本件；两种二元伪相关口径分别评估。');
 const {seed,k1,b}=options(params),queryCount=params.query_count??50,constant=params.rrf_constant??60;
 const queries=seededShuffle(records.filter(isGranted).sort((a,b)=>a.id.localeCompare(b.id)),seed).slice(0,queryCount),vectors=vectorCohort(records),vectorIds=new Set(vectors.records.map(p=>p.id));
 result.warnings.push(...vectors.warnings,'同维向量仍需由数据提供者核对是否来自同一嵌入模型及版本。');
 const setupStart=performance.now(),search=bm25Index(records,k1,b),setupMs=performance.now()-setupStart;
 const aliases=new Map<string,string[]>();for(const p of records){const key=citationKey(p.id);if(!aliases.has(key))aliases.set(key,[]);aliases.get(key)!.push(p.id);}
 const strong=new Map(records.map(p=>[p.id,new Set<string>()]));
 for(const p of records)for(const cited of p.citations)for(const id of aliases.get(citationKey(cited))||[]){if(id===p.id)continue;strong.get(p.id)!.add(id);strong.get(id)!.add(p.id);}
 const coverage=records.filter(p=>p.citations.length).length/records.length,internalCoverage=records.filter(p=>strong.get(p.id)!.size).length/records.length;
 result.warnings.push(`伪标注，非人工评判；引用覆盖率不足时查全率被低估。引用字段非空覆盖率 ${(coverage*100).toFixed(2)}%，语料内互引覆盖率 ${(internalCoverage*100).toFixed(2)}%；缺失与零引用无法区分。`);
 if(coverage===0)result.warnings.push('缺少引用，强相关指标不可计算，返回null；仍报告IPC弱相关指标。');
 if(vectorIds.size<records.length)result.warnings.push('向量与RRF只评估有可用嵌入的抽样查询，候选向量亦限可用件；请结合query_ids和sample_size比较，覆盖不同的指标不可直接归因于算法。');
 const perMethod=new Map<string,{query:Patent;hits:Hit[];elapsed:number}[]>([['bm25',[]],['vector',[]],['rrf',[]]]);
 const weak=new Map<string,Set<string>>();
 for(const q of queries){
  const groups=new Set(q.ipc.map(ipcMainGroup).filter(Boolean));
  weak.set(q.id,new Set(records.filter(p=>p.id!==q.id&&p.ipc.some(code=>groups.has(ipcMainGroup(code)))).map(p=>p.id)));
  let start=performance.now();const lexical=search(patentText(q),q.id),bmMs=performance.now()-start;
  perMethod.get('bm25')!.push({query:q,hits:lexical,elapsed:bmMs});
  if(vectorIds.has(q.id)){
   start=performance.now();const semantic=vectorRank(vectors.records,q),vectorMs=performance.now()-start;
   perMethod.get('vector')!.push({query:q,hits:semantic,elapsed:vectorMs});
   start=performance.now();const fused=rrf([lexical,semantic],constant),fusionMs=performance.now()-start;
   perMethod.get('rrf')!.push({query:q,hits:fused,elapsed:bmMs+vectorMs+fusionMs});
  }
 }
 for(const [method,runs] of perMethod){
  if(!runs.length)result.warnings.push(`${method}没有可评估查询。`);
  for(const basis of ['citation','ipc'] as const)for(const k of [5,10]){
   const labeled=runs.filter(run=>(basis==='citation'?strong:weak).get(run.query.id)!.size);
   const metrics=labeled.map(run=>rankingMetrics(run.hits,(basis==='citation'?strong:weak).get(run.query.id)!,k));
   const precision=average(metrics.map(m=>m.precision)),recall=average(metrics.map(m=>m.recall!)),ndcg=average(metrics.map(m=>m.ndcg!));
   result.rows.push({type:'comparison_run',method_name:method,comparison_label:`${method}/${basis}@${k}`,parameters:{bm25_k1:k1,bm25_b:b,rrf_constant:constant,query_count:queryCount},data_range:range(records),seed,basis,k,metrics:{precision,recall,ndcg},precision,recall,ndcg,elapsed_ms:runs.reduce((s,r)=>s+r.elapsed,0),mean_query_ms:average(runs.map(r=>r.elapsed)),setup_ms:method==='vector'?0:setupMs,sample_size:runs.length,evaluated_queries:labeled.length,query_ids:runs.map(r=>r.query.id),citation_coverage:coverage,internal_citation_coverage:internalCoverage});
  }
  for(const run of runs)result.rows.push({type:'retrieval_query',method_name:method,query_patent:run.query.id,patents:run.hits.slice(0,10).map(h=>h.patent),hits:run.hits.slice(0,10),strong_relevant:[...strong.get(run.query.id)!].sort(),weak_relevant:[...weak.get(run.query.id)!].sort(),elapsed_ms:run.elapsed});
 }
 result.summary=`从${records.filter(isGranted).length}件授权件固定抽样${queries.length}件；报告三种方法的两种伪相关口径及k=5、10指标。`;
 if(!queries.length){result.status='unavailable';result.warnings.push('当前范围没有可识别的授权件。');}
 result.chart={kind:'bar',x:'comparison_label',y:'ndcg'};
 result.evidence=queries.map(q=>q.id);
 return result;
}

export function compareClassification(records:Patent[],params:Params):Output{
 records=records.slice().sort((a,b)=>a.id.localeCompare(b.id));
 const result=output('classification-comparison-v1：第一个IPC的主组；固定种子分层开发/留出划分；只在开发集分层交叉验证按宏F1选择近邻数；全部选参完成后，每种方法对留出集评估一次。无模型训练。');
 const {seed,k1,b}=options(params),minimum=params.min_class_size??10,ratio=params.development_ratio??.7,folds=params.cv_folds??3,candidates=params.k_candidates??[1,3,5,7];
 const counts=new Map<string,number>();for(const p of records){const label=firstLabel(p);if(label)counts.set(label,(counts.get(label)||0)+1);}
 const eligible=records.filter(p=>firstLabel(p)&&(counts.get(firstLabel(p))||0)>=minimum);
 if(!eligible.length){result.status='unavailable';result.summary=`没有满足每类至少${minimum}件且第一个IPC可解析的类别。`;result.warnings.push('未划分开发集或留出集，未选参或评估。');return result;}
 const {development,holdout}=stratifiedSplit(eligible,ratio,seed),vectors=vectorCohort(development),ids=new Set(vectors.records.map(p=>p.id));
 result.warnings.push(...vectors.warnings);
 if(eligible.length<records.length)result.warnings.push(`排除${records.length-eligible.length}件：第一个IPC缺失/无法解析，或类别未达到样本阈值。`);
 const selections:SelectedClassification[]=[],methods:ClassificationMethod[]=['knn','nearest_centroid','bm25_vote'];
 const baseParams={min_class_size:minimum,development_ratio:ratio,cv_folds:folds,k_candidates:candidates,bm25_k1:k1,bm25_b:b};
 // Selection stage has no holdout argument. Complete all selection before evaluation starts.
 for(const method of methods){
  const dev=method==='bm25_vote'?development:development.filter(p=>ids.has(p.id));
  const perClass=new Map<string,number>();for(const p of dev)perClass.set(firstLabel(p),(perClass.get(firstLabel(p))||0)+1);
  if([...counts.keys()].filter(label=>eligible.some(p=>firstLabel(p)===label)).some(label=>(perClass.get(label)||0)<2)){
   result.rows.push({type:'comparison_run',method_name:method,parameters:baseParams,data_range:range(dev),seed,metrics:{accuracy:null,macro_f1:null,top3_accuracy:null},elapsed_ms:0,sample_size:0,status:'unavailable'});
   result.warnings.push(`${method}开发集中部分合格类别不足2个可用样本，跳过该方法。`);continue;
  }
  selections.push(selectClassification(dev,method,{candidates,folds,seed,k1,b}));
 }
 // Only after selection inspect holdout vector availability; it cannot change the plan or k.
 const dimension=vectors.records[0]?.embedding?.length;
 const vectorTest=holdout.filter(p=>p.embedding?.length===dimension&&p.embedding?.every(Number.isFinite)&&p.embedding.some(v=>v!==0));
 if(vectorTest.length<holdout.length)result.warnings.push(`留出集嵌入缺失、无效或与开发集维度不一致：${holdout.length-vectorTest.length}/${holdout.length}件，嵌入方法跳过这些预测。`);
 if(ids.size<development.length||vectorTest.length<holdout.length)result.warnings.push('BM25投票使用全部合格样本，嵌入方法仅使用有可用嵌入的开发/留出样本；各行保存实际范围，覆盖不同的指标不可直接比较。');
 for(const selected of selections){
  const test=selected.method==='bm25_vote'?holdout:vectorTest;
  const evaluated=evaluateClassification(selected,test);
  const data_range={...range(eligible),development_ids:selected.development.map(p=>p.id),holdout_ids:test.map(p=>p.id),excluded_development_ids:development.filter(p=>!selected.development.some(d=>d.id===p.id)).map(p=>p.id),excluded_holdout_ids:holdout.filter(p=>!test.some(t=>t.id===p.id)).map(p=>p.id)};
  result.rows.push({type:'comparison_run',method_name:selected.method,parameters:{...baseParams,neighbor_k:selected.method==='nearest_centroid'?null:selected.neighbor_k,actual_cv_folds:selected.folds.length},data_range,seed,metrics:evaluated.metrics,...evaluated.metrics,elapsed_ms:evaluated.elapsed_ms,selection_ms:selected.selection_ms,sample_size:test.length,development_size:selected.development.length,holdout_size:test.length,cv_scores:selected.cv,cv_fold_ids:selected.folds,abstentions:evaluated.predictions.filter(p=>!p.predicted_label).length});
  for(const prediction of evaluated.predictions)result.rows.push({type:'classification_prediction',method_name:selected.method,...prediction,score_kind:selected.method==='bm25_vote'?'bm25':'cosine',patents:prediction.neighbors.map(n=>n.patent)});
  if(!test.length)result.warnings.push(`${selected.method}没有可用留出样本，指标为null。`);
  if(evaluated.predictions.some(p=>!p.predicted_label))result.warnings.push(`${selected.method}有无正分文本近邻的预测，保留null并按错误计入指标。`);
 }
 result.chart={kind:'bar',x:'method_name',y:'accuracy'};
 result.summary=`${counts.size?new Set(eligible.map(firstLabel)).size:0}类、${eligible.length}件；开发集${development.length}件、留出集${holdout.length}件；完成${selections.length}种方法的开发集选参与一次留出评估。`;
 result.warnings.push('留出指标只描述本次固定划分；同族或高度重复文本可能跨集合，随机划分不代表跨时间或新同族泛化。嵌入来源模型与版本需由数据提供者核对。');
 result.evidence=[...new Set(result.rows.filter(r=>r.type==='classification_prediction').flatMap(r=>[r.patent as string,...r.patents as string[]]))];
 return result;
}
