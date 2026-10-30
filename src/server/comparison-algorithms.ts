import type {Patent} from '@/lib/types';
import {tokens} from './algorithms';

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
