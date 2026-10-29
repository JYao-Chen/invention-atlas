import type {Patent} from '@/lib/types';
import {cosine, tokens} from './algorithms';

export type Hit={patent:string;score:number};
export const patentText=(p:Patent)=>p.title+'\n'+p.abstract;
const byScore=(a:Hit,b:Hit)=>b.score-a.score||a.patent.localeCompare(b.patent);
const mean=(values:number[])=>values.reduce((a,b)=>a+b,0)/values.length;

/** Weighted, undirected unigram TextRank; windows never cross patent boundaries. */
export function textRank(records:Patent[],window=4){
 const edges=new Map<string,Map<string,number>>();
 for(const p of records){
  const words=tokens(patentText(p));
  for(const word of words)if(!edges.has(word))edges.set(word,new Map());
  for(let i=0;i<words.length;i++)for(let j=i+1;j<Math.min(words.length,i+window);j++){
   const a=words[i],b=words[j];if(a===b)continue;
   edges.get(a)!.set(b,(edges.get(a)!.get(b)||0)+1);
   edges.get(b)!.set(a,(edges.get(b)!.get(a)||0)+1);
  }
 }
 const words=[...edges.keys()].sort(),n=words.length;if(!n)return [];
 const sums=new Map(words.map(w=>[w,[...edges.get(w)!.values()].reduce((a,b)=>a+b,0)]));
 let scores=new Map(words.map(w=>[w,1/n]));
 for(let iteration=0;iteration<100;iteration++){
  const dangling=words.filter(w=>!sums.get(w)).reduce((s,w)=>s+scores.get(w)!,0);
  const next=new Map(words.map(w=>[w,(1-.85)/n+.85*dangling/n]));
  for(const word of words)for(const [target,weight] of edges.get(word)!)next.set(target,next.get(target)!+.85*scores.get(word)!*weight/sums.get(word)!);
  const delta=words.reduce((sum,w)=>sum+Math.abs(next.get(w)!-scores.get(w)!),0);scores=next;if(delta<1e-8)break;
 }
 return words.map(word=>({word,score:scores.get(word)!})).sort((a,b)=>b.score-a.score||a.word.localeCompare(b.word));
}

/** YAKE single-word features. Case is retained until after feature extraction. */
export function yake(text:string){
 const sentences=text.split(/[.!?\n]+/).filter(s=>s.trim());
 type Term={tf:number;upper:number;capital:number;sentences:Set<number>;left:Map<string,number>;right:Map<string,number>};
 const terms=new Map<string,Term>();
 sentences.forEach((sentence,s)=>{
  const words=(sentence.match(/[a-z][a-z-]{2,}/gi)||[]).map((raw,index)=>({raw,index,word:raw.toLowerCase()})).filter(w=>tokens(w.word).length);
  words.forEach(({raw,index,word})=>{
   if(!terms.has(word))terms.set(word,{tf:0,upper:0,capital:0,sentences:new Set(),left:new Map(),right:new Map()});
   const t=terms.get(word)!;t.tf++;t.sentences.add(s);
   if(raw===raw.toUpperCase())t.upper++;else if(index>0&&/^[A-Z]/.test(raw))t.capital++;
  });
  for(let i=0;i<words.length;i++)for(let j=i+1;j<Math.min(words.length,i+3);j++){
   const a=words[i].word,b=words[j].word;
   const right=terms.get(a)!.right,left=terms.get(b)!.left;
   right.set(b,(right.get(b)||0)+1);left.set(a,(left.get(a)||0)+1);
  }
 });
 const frequencies=[...terms.values()].map(t=>t.tf);if(!frequencies.length)return [];
 const average=mean(frequencies),std=Math.sqrt(mean(frequencies.map(n=>(n-average)**2))),max=Math.max(...frequencies);
 return [...terms].map(([word,t])=>{
  const positions=[...t.sentences].sort((a,b)=>a-b),mid=Math.floor(positions.length/2);
  const median=positions.length%2?positions[mid]:(positions[mid-1]+positions[mid])/2;
  const diversity=(m:Map<string,number>)=>m.size/([...m.values()].reduce((a,b)=>a+b,0)||1);
  const casing=Math.max(t.upper,t.capital)/(1+Math.log(t.tf)),position=Math.log(Math.log(3+median));
  const frequency=t.tf/(average+std),relatedness=1+(diversity(t.left)+diversity(t.right))*t.tf/max,spread=t.sentences.size/sentences.length;
  const score=position*relatedness/(casing+(frequency+spread)/relatedness);
  return {word,score,features:{casing,position,frequency,relatedness,spread}};
 }).sort((a,b)=>a.score-b.score||a.word.localeCompare(b.word));
}

/** Build once for a reference corpus. Query terms are binary; zero-score hits are excluded. */
export function bm25Index(records:Patent[],k1=1.2,b=.75){
 const documents=records.map(p=>tokens(patentText(p))),lengths=documents.map(d=>d.length);
 const average=lengths.reduce((a,b)=>a+b,0)/(records.length||1)||1;
 const postings=new Map<string,{index:number;tf:number}[]>();
 documents.forEach((words,index)=>{
  const counts=new Map<string,number>();for(const w of words)counts.set(w,(counts.get(w)||0)+1);
  for(const [word,tf] of counts){if(!postings.has(word))postings.set(word,[]);postings.get(word)!.push({index,tf});}
 });
 return (query:string,exclude?:string):Hit[]=>{
  const scores=new Map<number,number>();
  for(const word of new Set(tokens(query))){
   const list=postings.get(word)||[],idf=Math.log(1+(records.length-list.length+.5)/(list.length+.5));
   for(const {index,tf} of list){if(records[index].id===exclude)continue;const score=idf*tf*(k1+1)/(tf+k1*(1-b+b*lengths[index]/average));scores.set(index,(scores.get(index)||0)+score);}
  }
  return [...scores].map(([i,score])=>({patent:records[i].id,score})).filter(h=>h.score>0).sort(byScore);
 };
}

export function rrf(rankings:Hit[][],constant=60):Hit[]{
 const scores=new Map<string,number>();
 for(const hits of rankings){const seen=new Set<string>();hits.forEach((hit,i)=>{if(seen.has(hit.patent))return;seen.add(hit.patent);scores.set(hit.patent,(scores.get(hit.patent)||0)+1/(constant+i+1));});}
 return [...scores].map(([patent,score])=>({patent,score})).sort(byScore);
}
export function vectorRank(records:Patent[],query:Patent):Hit[]{
 return records.filter(p=>p.id!==query.id).map(p=>({patent:p.id,score:cosine(query.embedding!,p.embedding!)})).sort(byScore);
}

/** Do not compare vectors of unknown/mixed dimensionality or silently pick a model. */
export function vectorCohort(records:Patent[]){
 const valid=records.filter(p=>p.embedding?.length&&p.embedding.every(Number.isFinite)&&p.embedding.some(n=>n!==0));
 const dimensions=new Set(valid.map(p=>p.embedding!.length));
 const warnings:string[]=[];
 if(valid.length<records.length)warnings.push(`嵌入缺失、非有限或零向量：${records.length-valid.length}/${records.length} 件；不调用嵌入接口。`);
 if(dimensions.size>1)warnings.push('嵌入维度不一致，跳过向量方法；需审核嵌入来源。');
 return {records:dimensions.size>1?[]:valid,warnings};
}
export function rankingMetrics(hits:Hit[],relevant:Set<string>,k:number){
 const top=hits.slice(0,k),tp=top.filter(h=>relevant.has(h.patent)).length;
 const dcg=top.reduce((sum,h,i)=>sum+(relevant.has(h.patent)?1/Math.log2(i+2):0),0);
 const ideal=Array.from({length:Math.min(k,relevant.size)},(_,i)=>1/Math.log2(i+2)).reduce((a,b)=>a+b,0);
 return {precision:tp/k,recall:relevant.size?tp/relevant.size:null,ndcg:ideal?dcg/ideal:null};
}
export function ipcMainGroup(code:string){
 const match=code.toUpperCase().replace(/\s/g,'').match(/^([A-H]\d{2}[A-Z])(\d+)\/\d+$/);
 return match?match[1]+Number(match[2])+'/00':'';
}
export const firstLabel=(p:Patent)=>ipcMainGroup(p.ipc[0]||'');

export function seededShuffle<T>(items:T[],seed:number):T[]{
 const result=items.slice();let state=seed>>>0;
 for(let i=result.length-1;i>0;i--){state=(Math.imul(1664525,state)+1013904223)>>>0;const j=Math.floor(state/4294967296*(i+1));[result[i],result[j]]=[result[j],result[i]];}
 return result;
}
function labelGroups(records:Patent[]){
 const groups=new Map<string,Patent[]>();
 for(const p of records.slice().sort((a,b)=>a.id.localeCompare(b.id))){const label=firstLabel(p);if(!label)continue;if(!groups.has(label))groups.set(label,[]);groups.get(label)!.push(p);}
 return [...groups].sort(([a],[b])=>a.localeCompare(b));
}
export function stratifiedSplit(records:Patent[],ratio=.7,seed=42){
 const development:Patent[]=[],holdout:Patent[]=[];
 for(const [,group] of labelGroups(records)){
  if(group.length<3)throw new Error('分层划分每类至少需要3件：开发集至少2件、留出集至少1件');
  const shuffled=seededShuffle(group,seed),n=Math.max(2,Math.min(group.length-1,Math.floor(group.length*ratio)));
  development.push(...shuffled.slice(0,n));holdout.push(...shuffled.slice(n));
 }
 return {development,holdout};
}
export function stratifiedFolds(development:Patent[],requested=3,seed=42){
 const groups=labelGroups(development),n=Math.min(requested,...groups.map(([,ps])=>ps.length));
 if(!groups.length||n<2)return [];
 const folds=Array.from({length:n},()=>[] as Patent[]);
 for(const [,group] of groups)seededShuffle(group,seed).forEach((p,i)=>folds[i%n].push(p));
 return folds;
}
