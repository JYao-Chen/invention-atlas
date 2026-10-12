'use client';
import {useEffect,useRef,useState} from 'react';
type Budget={max_calls:number|null;started_calls:number}|null;
/** Operate: compact, inline task controls. Request counts are not token costs; existing report composition remains unchanged. */
export default function RunBudget({runId,readOnly}:{runId:string;readOnly:boolean}){
 const [budget,setBudget]=useState<Budget>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[maximum,setMaximum]=useState('');
 const controller=useRef<AbortController|null>(null);
 useEffect(()=>()=>controller.current?.abort(),[]);
 async function read(){
  controller.current?.abort();const active=new AbortController();controller.current=active;setBusy(true);setError('');setNotice('');
  try{const response=await fetch('/api/runs/'+runId+'/budget',{signal:active.signal});const body=await response.json();if(!response.ok)throw new Error(body.error||'读取预算失败');if(!active.signal.aborted){setBudget(body.budget);setMaximum(body.budget?.max_calls?.toString()||'');}}
  catch(e){if(!active.signal.aborted)setError((e as Error).message);}finally{if(!active.signal.aborted)setBusy(false);}
 }
 async function save(){
  setBusy(true);setError('');setNotice('');
  try{const response=await fetch('/api/runs/'+runId+'/budget',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({maxCalls:Number(maximum)})});const body=await response.json();if(!response.ok)throw new Error(body.error||'保存预算失败');setBudget(body.budget);setNotice('调用上限已保存；不会自动重启已结束的任务。');}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <details className="run-budget" onToggle={e=>{if(e.currentTarget.open&&budget===undefined&&!busy)void read();}}>
  <summary>模型调用预算</summary>
  <p>按本次运行的请求次数限制聊天与嵌入调用。失败请求也消耗额度，不代表费用上限。</p>
  {busy&&<p role="status">正在处理预算…</p>}
  {budget!==undefined&&<p>已开始 {budget?.started_calls??0} 次 · {budget?.max_calls===null||!budget?'未设置调用上限':'上限 '+budget.max_calls+' 次'}</p>}
  {!readOnly&&budget!==undefined&&<form onSubmit={e=>{e.preventDefault();void save();}}>
   <label>最大调用次数<input type="number" min={1} max={2147483647} step={1} required value={maximum} disabled={busy} onChange={e=>setMaximum(e.target.value)}/></label>
   <button disabled={busy}>保存上限</button>
  </form>}
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <button type="button" disabled={busy} onClick={()=>void read()}>刷新预算</button>
 </details>;
}
