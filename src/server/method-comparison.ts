import type {AnalysisResult,Params,Patent,Row} from '@/lib/types';
import {keywordWeights,tokens} from './algorithms';
import {patentText,textRank,yake} from './comparison-algorithms';

type Output=Pick<AnalysisResult,'rows'|'summary'|'method'|'warnings'|'evidence'|'chart'|'status'>;
const range=(records:Patent[])=>({patent_ids:records.map(p=>p.id),record_count:records.length,text_fields:['title','abstract']});
function output(method:string):Output{return {rows:[],summary:'',method,warnings:[],evidence:[],status:'completed'};}

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

 if(!lists.get('tfidf')?.length)result.warnings.push('标题与摘要没有可用英文词项，关键词为空。');
 result.evidence=[...new Set(result.rows.flatMap(r=>Array.isArray(r.patents)?r.patents as string[]:[]))];
 return result;
}
