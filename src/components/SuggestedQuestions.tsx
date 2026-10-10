'use client';
import {useEffect,useState,useRef} from 'react';
import {RefreshCw} from 'lucide-react';
import type {Starter,StarterPool} from '@/lib/types';
export default function SuggestedQuestions({datasetId,initialPool,onPoolChange,onChoose}:{datasetId?:string;initialPool:StarterPool;onPoolChange:(pool:StarterPool)=>void;onChoose:(item:Starter)=>void}){
 const [pool,setPool]=useState(initialPool),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const queue=useRef(initialPool),consumed=useRef<string[]>([]),pending=useRef<AbortController|undefined>(undefined),refining=useRef<AbortController|undefined>(undefined);
 useEffect(()=>{pending.current?.abort();pending.current=undefined;refining.current?.abort();refining.current=undefined;queue.current=initialPool;consumed.current=[];setPool(initialPool);setBusy(false);setError('');void refineReserves();return()=>{pending.current?.abort();refining.current?.abort();};},[datasetId,initialPool.version]);
 function publish(value:StarterPool){queue.current=value;setPool(value);onPoolChange(value);}
 function merge(incoming:StarterPool){const unseen=incoming.batches.filter(b=>!consumed.current.includes(b.id)),existing=queue.current.batches;return {...incoming,batches:[...existing.map((b,index)=>index===0?b:unseen.find(p=>p.id===b.id)||b),...unseen.filter(b=>!existing.some(p=>p.id===b.id))].slice(0,3)};}
 async function refineReserves(){if(!datasetId||refining.current)return;const controller=new AbortController();refining.current=controller;try{const response=await fetch('/api/starters?dataset='+encodeURIComponent(datasetId)+'&warm=1',{signal:controller.signal});if(response.ok){const incoming:StarterPool=await response.json();if(!controller.signal.aborted&&incoming.version===queue.current.version)publish(merge(incoming));}}catch{}finally{if(refining.current===controller)refining.current=undefined;}}
 async function replenish(){
  if(!datasetId||pending.current)return;const controller=new AbortController();pending.current=controller;setBusy(true);setError('');
  try{do{const sent=[...consumed.current];const response=await fetch('/api/starters',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'pool',datasetId,consumed:sent}),signal:controller.signal});if(!response.ok)throw new Error('下一批问题补充失败，可重新尝试');const incoming:StarterPool=await response.json();const unseen=incoming.batches.filter(b=>!consumed.current.includes(b.id));const existing=queue.current.batches;const batches=[...existing,...unseen.filter(b=>!existing.some(p=>p.id===b.id))].slice(0,3);publish(incoming.version===queue.current.version?{version:incoming.version,batches}:incoming);consumed.current=consumed.current.filter(id=>!sent.includes(id));if(!consumed.current.length)break;}while(!controller.signal.aborted);
  }catch(e){if(!controller.signal.aborted)setError((e as Error).message);}finally{if(pending.current===controller){pending.current=undefined;setBusy(false);void refineReserves();}}
 }
 function next(){if(queue.current.batches.length>1){consumed.current.push(queue.current.batches[0].id);publish({...queue.current,batches:queue.current.batches.slice(1)});}void replenish();}
 const items=pool.batches[0]?.items||[];
 return <div className="suggested-questions"><button className="suggestion-refresh" onClick={next} disabled={!datasetId||(busy&&pool.batches.length<2)}><RefreshCw size={14}/>换一组</button>{items.map(item=><button key={item.name} data-group={item.group} onClick={()=>onChoose(item)}><span><strong>{item.title}</strong><small>{item.question}</small></span></button>)}{error&&<p role="status">{error}</p>}{!items.length&&<p>导入专利后，将显示可执行的推荐问题。</p>}</div>;
}
