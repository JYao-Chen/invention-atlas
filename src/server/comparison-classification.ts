import type {Patent} from '@/lib/types';
import {cosine} from './algorithms';
import {bm25Index,firstLabel,stratifiedFolds,vectorRank,type Hit} from './comparison-algorithms';

export type ClassificationMethod='knn'|'nearest_centroid'|'bm25_vote';
export type ClassificationOptions={candidates:number[];folds:number;seed:number;k1:number;b:number};
export type Prediction={patent:string;actual_label:string;predicted_label:string|null;top_labels:string[];neighbors:Hit[]};
function voteLabels(ranked:Hit[],labels:Map<string,string>,k:number){
 const votes=new Map<string,{count:number;score:number}>();
 for(const hit of ranked.slice(0,k)){const label=labels.get(hit.patent)!,v=votes.get(label)||{count:0,score:0};v.count++;v.score+=hit.score;votes.set(label,v);}
 return [...votes].sort(([a,av],[b,bv])=>bv.count-av.count||bv.score-av.score||a.localeCompare(b)).map(([label])=>label);
}
export function classifier(reference:Patent[],method:ClassificationMethod,k:number,k1:number,b:number){
 const labels=new Map(reference.map(p=>[p.id,firstLabel(p)])),search=method==='bm25_vote'?bm25Index(reference,k1,b):undefined;
 const centroids=new Map<string,number[]>();
 if(method==='nearest_centroid'){
  const groups=new Map<string,Patent[]>();for(const p of reference){const label=firstLabel(p);if(!groups.has(label))groups.set(label,[]);groups.get(label)!.push(p);}
  for(const [label,ps] of groups){
   const centroid=Array(ps[0].embedding!.length).fill(0) as number[];
   for(const p of ps){const norm=Math.hypot(...p.embedding!);p.embedding!.forEach((v,i)=>centroid[i]+=v/norm/ps.length);}
   centroids.set(label,centroid);
  }
 }
 return (query:Patent):Prediction=>{
  const ranked=search?search(query.title+' '+query.abstract,query.id):vectorRank(reference,query);
  let top:string[];
  if(method==='nearest_centroid')top=[...centroids].map(([label,v])=>({label,score:cosine(query.embedding!,v)})).sort((a,b)=>b.score-a.score||a.label.localeCompare(b.label)).map(r=>r.label);
  else top=voteLabels(ranked,labels,k);
  return {patent:query.id,actual_label:firstLabel(query),predicted_label:top[0]??null,top_labels:top.slice(0,3),neighbors:ranked.slice(0,method==='nearest_centroid'?1:k)};
 };
}
export function classificationMetrics(predictions:Prediction[],labels:string[]){
 if(!predictions.length)return {accuracy:null,macro_f1:null,top3_accuracy:null};
 const f1=labels.map(label=>{
  const tp=predictions.filter(p=>p.actual_label===label&&p.predicted_label===label).length;
  const fp=predictions.filter(p=>p.actual_label!==label&&p.predicted_label===label).length;
  const fn=predictions.filter(p=>p.actual_label===label&&p.predicted_label!==label).length;
  return 2*tp+fp+fn?2*tp/(2*tp+fp+fn):0;
 });
 return {accuracy:predictions.filter(p=>p.actual_label===p.predicted_label).length/predictions.length,macro_f1:f1.reduce((a,b)=>a+b,0)/labels.length,top3_accuracy:predictions.filter(p=>p.top_labels.includes(p.actual_label)).length/predictions.length};
}

/** This API accepts development data only. Neither the split nor holdout is available here. */
export function selectClassification(development:Patent[],method:ClassificationMethod,options:ClassificationOptions){
 const start=performance.now(),folds=stratifiedFolds(development,options.folds,options.seed);
 if(!folds.length)throw new Error('开发集每类至少需要2件才能交叉验证');
 const labels=[...new Set(development.map(firstLabel))].sort();
 const candidates=method==='nearest_centroid'?[1]:[...new Set(options.candidates)].sort((a,b)=>a-b);
 const maxK=Math.max(...candidates),labelById=new Map(development.map(p=>[p.id,firstLabel(p)]));
 const validationPredictions=folds.map((validation,i)=>{
  // IDF, centroids and neighbors are computed exclusively from this fold's reference data.
  // Compute rankings once per query, then reuse their prefixes for every candidate k.
  const reference=folds.flatMap((fold,j)=>j===i?[]:fold),predict=classifier(reference,method,maxK,options.k1,options.b);
  return validation.map(predict);
 });
 const cv=candidates.map(k=>{
  const scores=validationPredictions.map(predictions=>{
   const voted=method==='nearest_centroid'?predictions:predictions.map(p=>{
    const top=voteLabels(p.neighbors,labelById,k);
    return {...p,predicted_label:top[0]??null,top_labels:top.slice(0,3)};
   });
   return classificationMetrics(voted,labels).macro_f1!;
  });
  return {neighbor_k:k,macro_f1:scores.reduce((a,b)=>a+b,0)/scores.length,fold_scores:scores};
 });
 const selected=cv.slice().sort((a,b)=>b.macro_f1-a.macro_f1||a.neighbor_k-b.neighbor_k)[0];
 return {method,neighbor_k:selected.neighbor_k,options,development:development.slice(),labels,cv,folds:folds.map(f=>f.map(p=>p.id)),selection_ms:performance.now()-start};
}
export type SelectedClassification=ReturnType<typeof selectClassification>;

/** Called exactly once per selected method by the comparison runner, after all selection. */
export function evaluateClassification(selected:SelectedClassification,holdout:Patent[]){
 const start=performance.now();
 const referenceIds=new Set(selected.development.map(p=>p.id));
 if(holdout.some(p=>referenceIds.has(p.id)))throw new Error('留出集与开发集重叠');
 const predict=classifier(selected.development,selected.method,selected.neighbor_k,selected.options.k1,selected.options.b);
 const predictions=holdout.map(predict);
 return {predictions,metrics:classificationMetrics(predictions,selected.labels),elapsed_ms:performance.now()-start};
}
