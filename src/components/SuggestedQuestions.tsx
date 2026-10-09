'use client';
import {useEffect,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import {suggest} from '@/lib/suggestions';
type Tool={name:string;title:string;group:string;available:boolean};
export default function SuggestedQuestions({tools,onChoose}:{tools:Tool[];onChoose:(question:string)=>void}){
 const [items,setItems]=useState<ReturnType<typeof suggest>>([]);
 useEffect(()=>{setItems(suggest(tools));},[tools]);
 return <div className="suggested-questions"><button className="suggestion-refresh" onClick={()=>setItems(suggest(tools,items.map(t=>t.name)))} disabled={!items.length}><RefreshCw size={14}/>换一组</button>{items.map(item=><button key={item.name} data-group={item.group} onClick={()=>onChoose(item.question)}><span><strong>{item.title}</strong><small>{item.question}</small></span></button>)}{!items.length&&<p>加载可用分析能力后，将显示推荐问题。</p>}</div>;
}
