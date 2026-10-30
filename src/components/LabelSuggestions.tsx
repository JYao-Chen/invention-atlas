'use client';
import {useEffect,useRef,useState} from 'react';
type Suggestion={labelId:string;labelName:string;reason:string;evidence:{field:string;start:number;end:number;quote:string;sourceUrl?:string}[]};
export default function LabelSuggestions({datasetId,patentId,available,disabled,onSaved}:{datasetId:string;patentId:string;available:boolean;disabled:boolean;onSaved:()=>Promise<void>}){
 const controller=useRef<AbortController|null>(null);
 const [suggestions,setSuggestions]=useState<Suggestion[]>([]),[generating,setGenerating]=useState(false),[saving,setSaving]=useState(''),[saved,setSaved]=useState<string[]>([]),[error,setError]=useState(''),[generated,setGenerated]=useState(false);
 useEffect(()=>()=>controller.current?.abort(),[]);
 async function generate(){
  const request=new AbortController();controller.current=request;setGenerating(true);setError('');
  try{const response=await fetch('/api/patent-annotations/suggest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({datasetId,patentId}),signal:request.signal});const data=await response.json();if(!response.ok)throw new Error(data.error||'标引建议生成失败');setSuggestions(data.suggestions);setSaved([]);setGenerated(true);}
  catch(e){if(!request.signal.aborted)setError((e as Error).message);}
  finally{if(controller.current===request){controller.current=null;setGenerating(false);}}
 }
 async function save(item:Suggestion){
  setSaving(item.labelId);setError('');
  try{const body=item.reason+'\n\n原文依据\n'+item.evidence.map(e=>(e.field==='title'?'标题':'摘要')+' ['+e.start+'–'+e.end+']\n'+e.quote).join('\n\n');if(body.length>20000)throw new Error('原文依据超过笔记长度限制，请改用人工标引。');
   const response=await fetch('/api/patent-annotations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({datasetId,patentId,labelId:item.labelId,body,origin:'ai-suggestion'})});const data=await response.json();if(!response.ok)throw new Error(data.error||'保存建议失败');setSaved(previous=>[...previous,item.labelId]);await onSaved();
  }catch(e){setError((e as Error).message);}finally{setSaving('');}
 }
 return <details><summary>AI 标引建议</summary><p className="muted">依据标题和摘要，从本项目标签中选择。</p>
  {!available&&<p>请先创建项目标签。</p>}
  <div className="annotation-actions"><button disabled={!available||disabled||generating||!!saving} onClick={()=>void generate()}>{generating?'正在生成建议…':generated?'重新生成建议':'生成标引建议'}</button>{generating&&<button onClick={()=>controller.current?.abort()}>取消生成</button>}</div>
  {generated&&!suggestions.length&&<p>未找到适合当前专利的项目标签。</p>}
  {suggestions.map(item=><section key={item.labelId}><h4>{item.labelName}</h4><p>{item.reason}</p><details><summary>查看原文依据</summary>{item.evidence.map((e,index)=><blockquote key={index}><small>{e.field==='title'?'标题':'摘要'} · 字符 {e.start}–{e.end}</small><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{e.quote}</p></blockquote>)}</details><button disabled={disabled||generating||!!saving||saved.includes(item.labelId)} onClick={()=>void save(item)}>{saved.includes(item.labelId)?'已保存为待确认建议':saving===item.labelId?'正在保存…':'保存为待确认建议'}</button></section>)}
  {error&&<p className="error" role="alert">{error}</p>}
 </details>;
}
