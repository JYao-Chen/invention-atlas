'use client';
import {useEffect,useState,useRef} from 'react';
import {RefreshCw} from 'lucide-react';
import type {Starter} from '@/lib/types';
import {readEventStream} from '@/lib/event-stream';
export default function SuggestedQuestions({datasetId,onChoose}:{datasetId?:string;onChoose:(item:Starter)=>void}){
 const [items,setItems]=useState<Starter[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');const pending=useRef<AbortController|undefined>(undefined);
 async function refresh(previous:string[]=[]){if(!datasetId)return;pending.current?.abort();const controller=new AbortController();pending.current=controller;setBusy(true);setError('');try{const response=await fetch('/api/starters',{method:'POST',headers:{'Content-Type':'application/json',Accept:'text/event-stream'},body:JSON.stringify({datasetId,previous}),signal:controller.signal});if(!response.ok||!response.body)throw new Error('推荐问题加载失败，请换一组重试');await readEventStream(response.body,text=>{const data=JSON.parse(text);if(Array.isArray(data.items))setItems(data.items);if(data.error)setError(data.error);});}catch(e){if(!controller.signal.aborted)setError((e as Error).message);}finally{if(pending.current===controller)setBusy(false);}}
 useEffect(()=>{setItems([]);void refresh();return()=>pending.current?.abort();},[datasetId]);
 return <div className="suggested-questions" aria-busy={busy}><button className="suggestion-refresh" onClick={()=>void refresh(items.map(t=>t.name))} disabled={busy||!datasetId}><RefreshCw size={14}/>{busy?'正在生成…':'换一组'}</button>{items.map(item=><button key={item.name} data-group={item.group} onClick={()=>onChoose(item)}><span><strong>{item.title}</strong><small>{item.question}</small></span></button>)}{error&&<p role="status">{error}</p>}{!items.length&&!error&&<p>{busy?'正在根据当前专利库准备问题…':'导入专利后，将显示可执行的推荐问题。'}</p>}</div>;
}
