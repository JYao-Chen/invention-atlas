import type {Patent,Row} from '@/lib/types';

/** PCA is only a display projection; cluster membership remains the original K-means output. */
export function clusterMap(records:Patent[],rows:Row[]){
 if(!records.length)return {points:[],variance:[0,0]};
 const dimensions=records[0].embedding!.length;
 const vectors=records.map(p=>{const norm=Math.hypot(...p.embedding!)||1;return p.embedding!.map(v=>v/norm);});
 const mean=Array.from({length:dimensions},(_,j)=>vectors.reduce((sum,v)=>sum+v[j],0)/vectors.length);
 const centered=vectors.map(v=>v.map((value,j)=>value-mean[j]));
 const dot=(a:number[],b:number[])=>a.reduce((sum,v,j)=>sum+v*b[j],0);
 const axes:number[][]=[],energy:number[]=[];
 for(let component=0;component<2;component++){
  let axis=Array.from({length:dimensions},(_,j)=>Math.sin((j+1)*(component+1.37)));
  for(let iteration=0;iteration<100;iteration++){
   const next=Array(dimensions).fill(0) as number[];
   for(const v of centered){const score=dot(v,axis);for(let j=0;j<dimensions;j++)next[j]+=v[j]*score;}
   for(const previous of axes){const overlap=dot(next,previous);for(let j=0;j<dimensions;j++)next[j]-=overlap*previous[j];}
   const norm=Math.hypot(...next);if(norm<1e-12){axis=Array(dimensions).fill(0);break;}
   const unit=next.map(v=>v/norm),change=Math.hypot(...unit.map((v,j)=>v-axis[j]));axis=unit;if(change<1e-8)break;
  }
  axes.push(axis);energy.push(centered.reduce((sum,v)=>sum+dot(v,axis)**2,0));
 }
 const total=centered.reduce((sum,v)=>sum+dot(v,v),0);
 const membership=new Map(rows.flatMap(row=>(row.patents as string[]).map(id=>[id,Number(row.cluster)] as const)));
 return {points:records.map((p,i)=>({patent:p.id,title:p.title,cluster:membership.get(p.id)!,x:dot(centered[i],axes[0]),y:dot(centered[i],axes[1])})),variance:energy.map(e=>total?e/total:0)};
}
