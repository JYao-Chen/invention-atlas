'use client';
import {useEffect,useRef,useState} from 'react';
type Question={question:string;reason:string;evidence:{field:string;quote:string;start:number;end:number};modelAssisted:true};
export default function DisclosureQuestions({id,revision}:{id:string;revision:number}){
 const [questions,setQuestions]=useState<Question[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[generated,setGenerated]=useState(false);
 const controller=useRef<AbortController|null>(null);
 useEffect(()=>()=>controller.current?.abort(),[]);
 async function generate(){
  const task=new AbortController();controller.current=task;setBusy(true);setError('');setQuestions([]);setGenerated(false);
  try{
   const response=await fetch('/api/disclosures/'+id+'/questions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision}),signal:task.signal}),data=await response.json();
   if(!response.ok)throw new Error(data.error||'技术追问生成失败');
   if(task.signal.aborted)return;
   if(data.disclosureId!==id||data.revision!==revision)throw new Error('追问返回版本与当前材料不一致');
   setQuestions(data.questions);setGenerated(true);
  }catch(e){if(!task.signal.aborted)setError((e as Error).message);}
  finally{if(controller.current===task){controller.current=null;setBusy(false);}}
 }
 return <section aria-label="交底材料技术追问">
  <h4>保存第{revision}版的技术追问</h4><p className="muted">模型根据保存材料提出补充问题。引文用于核对所指内容，可据此补充材料。</p>
  <div className="record-actions"><button disabled={busy} onClick={()=>void generate()}>{generated?'重新生成技术追问':'生成技术追问'}</button>{busy&&<button onClick={()=>{controller.current?.abort();setBusy(false);}}>取消生成</button>}</div>
  {busy&&<p role="status">正在阅读保存材料并生成技术追问…</p>}
  {generated&&!questions.length&&<p role="status">本次未提出额外追问，不表示方案内容已完整。</p>}
  {questions.map((item,i)=><article key={i}><h5>{item.question}</h5><p>{item.reason}</p><details><summary>关联用户原文</summary><p className="muted">{item.evidence.field} · 字符{item.evidence.start}—{item.evidence.end}</p><blockquote style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{item.evidence.quote}</blockquote></details></article>)}
  {error&&<p role="alert">{error}</p>}
 </section>;
}
