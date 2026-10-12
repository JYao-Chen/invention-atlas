'use client';
import {useEffect,useRef,useState} from 'react';
import SourceConflicts from './SourceConflicts';
import SourceSchedule from './SourceSchedule';

type Counts={added:number;updated:number;unchanged:number};
type Task={run_id:string;status:string;queue_state:string;pending_confirmation?:boolean;question:string;error:string;created_at:string;scope:{offset:number;batches:number;query:string};progress?:{done?:number;total?:number;unit:string};counts?:Counts};
type Batch={id:string;source_name:string;source_url:string;observed_at:string;counts:Counts;source_windows:{offset:number;received:number;accepted:number}[];decisions?:{patentId:string;choice:'keep-manual'|'accept-source'}[]};
type TaskPage={tasks:Task[];page:number;pages:number;total:number};
const active=(task:Task)=>['queued','running'].includes(task.queue_state);
const states:Record<string,string>={queued:'等待执行',running:'正在更新',completed:'已完成',failed:'更新失败',cancelled:'已取消',interrupted:'已中断'};
const countText=(counts:Counts)=>`新增 ${counts.added} 条 · 更新 ${counts.updated} 条 · 不变 ${counts.unchanged} 条`;
async function read<T>(path:string,signal:AbortSignal,body?:unknown):Promise<T>{
 const response=await fetch('/api/source-updates'+path,{signal,...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
 const result=await response.json();if(!response.ok)throw new Error(result.error||'来源更新请求失败');return result;
}
export default function SourceUpdates({datasetId,readOnly,onChanged,onOpenRun}:{datasetId:string;readOnly:boolean;onChanged:()=>void;onOpenRun:(id:string)=>Promise<void>}){
 const [open,setOpen]=useState(false),[page,setPage]=useState(1),[revision,setRevision]=useState(0),[data,setData]=useState<TaskPage>(),[batches,setBatches]=useState<Batch[]>([]),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState('');
 const mutation=useRef<AbortController|null>(null),pendingRun=useRef<string|null>(null),changed=useRef(onChanged);changed.current=onChanged;
 useEffect(()=>()=>mutation.current?.abort(),[]);
 useEffect(()=>{
  if(!open)return;const control=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;setLoading(true);
  async function refresh(){
   try{
    const [next,history]=await Promise.all([read<TaskPage>(`/tasks?dataset=${encodeURIComponent(datasetId)}&page=${page}`,control.signal),read<{batches:Batch[]}>(`?dataset=${encodeURIComponent(datasetId)}`,control.signal)]);
    if(control.signal.aborted)return;setData(next);setBatches(history.batches);setError('');
    const submitted=next.tasks.find(task=>task.run_id===pendingRun.current);
    if(submitted&&!active(submitted)){pendingRun.current=null;if(submitted.counts)changed.current();}
    if(next.tasks.some(active)||pendingRun.current)timer=setTimeout(()=>void refresh(),3000);
   }catch(e){if(!control.signal.aborted)setError((e as Error).message);}
   finally{if(!control.signal.aborted)setLoading(false);}
  }
  void refresh();return()=>{control.abort();clearTimeout(timer);};
 },[datasetId,open,page,revision]);
 async function action(path:string,body:unknown){
  if(mutation.current)return;const control=new AbortController();mutation.current=control;setBusy(true);setError('');setNote('');
  try{const run=await read<{id:string}>(path,control.signal,body);if(control.signal.aborted)return;pendingRun.current=run.id;setNote('更新任务已保存，等待后台执行。');setPage(1);setRevision(value=>value+1);}
  catch(e){if(!control.signal.aborted)setError((e as Error).message);}
  finally{if(mutation.current===control){mutation.current=null;setBusy(false);}}
 }
 return <details className="source-updates" onToggle={event=>setOpen(event.currentTarget.open)}>
  <summary>来源更新与批次</summary>
  <p className="muted">从 DLT-Patents 读取指定窗口，更新当前数据集。每批最多读取100条；不调用嵌入模型。手工修订发生冲突时保留原数据并报告失败。</p>
  {!readOnly&&<form onSubmit={event=>{event.preventDefault();const values=new FormData(event.currentTarget);void action('/dlt',{datasetId,offset:Number(values.get('offset')),batches:Number(values.get('batches')),query:String(values.get('query')||'').trim()});}}>
   <fieldset disabled={busy}><label>起始源位置<input name="offset" type="number" min={0} max={49024} step={1} required defaultValue={10000}/></label><label>批次数<input name="batches" type="number" min={1} max={10} step={1} required defaultValue={1}/></label><label>英文筛选词（可留空）<input name="query" maxLength={2000} placeholder="例如 identity authentication"/></label></fieldset>
   <button disabled={busy||loading||Boolean(data?.tasks.some(active))}>{busy?'正在提交…':'提交来源更新'}</button>
  </form>}
  {readOnly&&<p className="muted">当前项目为只读，可查看更新任务和批次。</p>}
  {open&&<SourceSchedule key={datasetId} datasetId={datasetId} readOnly={readOnly}/>}
  {note&&<p role="status">{note}</p>}{error&&<p className="error" role="alert">{error}</p>}
  <div className="record-actions"><h4>更新任务{data&&` · ${data.total} 项`}</h4><button disabled={busy||loading} onClick={()=>setRevision(value=>value+1)}>刷新任务</button></div>
  {loading&&!data&&<p role="status">正在读取更新任务…</p>}
  {data&&!data.tasks.length&&<p className="muted">尚无来源更新任务。</p>}
  {data?.tasks.map(task=><article key={task.run_id}>
   <h4>{states[task.queue_state]||states[task.status]||task.status} · 源位置 {task.scope.offset}</h4>
   <p className="muted">{task.scope.batches} 批 · {task.scope.query||'未设置筛选词'} · {new Date(task.created_at).toLocaleString('zh-CN')}</p>
   {task.progress&&<p>{task.progress.unit}{task.progress.total!==undefined&&` ${task.progress.done??0}/${task.progress.total}`}</p>}
   {active(task)&&Boolean(task.progress?.total)&&<progress aria-label="来源更新进度" max={task.progress!.total} value={task.progress!.done??0}/>}
   {task.counts&&<p>{countText(task.counts)}</p>}{task.error&&<p className="error">{task.error}</p>}
   <div className="record-actions"><button disabled={busy} onClick={async()=>{try{await onOpenRun(task.run_id);}catch(e){setError((e as Error).message);}}}>查看运行记录</button>
   {!readOnly&&!active(task)&&['failed','cancelled','interrupted'].includes(task.status)&&<button disabled={busy||loading||Boolean(data.tasks.some(active))} onClick={()=>void action('/'+task.run_id+'/retry',{})}>重试来源更新</button>}</div>
   {!active(task)&&task.pending_confirmation&&<SourceConflicts runId={task.run_id} readOnly={readOnly} disabled={busy||Boolean(data.tasks.some(active))} onResolved={()=>{setRevision(value=>value+1);changed.current();}}/>}
  </article>)}
  {data&&data.pages>1&&<div className="pagination"><button disabled={loading||busy||data.page<=1} onClick={()=>setPage(data.page-1)}>上一页</button><span>{data.page}/{data.pages} 页</span><button disabled={loading||busy||data.page>=data.pages} onClick={()=>setPage(data.page+1)}>下一页</button></div>}
  <h4>最近入库批次 · 最多50批</h4>
  {!batches.length&&!loading&&<p className="muted">尚无来源更新批次。</p>}
  {batches.map(batch=><details key={batch.id}><summary>{new Date(batch.observed_at).toLocaleString('zh-CN')} · {countText(batch.counts)}</summary><p>{batch.source_name}</p><a href={batch.source_url} target="_blank" rel="noreferrer">打开数据来源</a><p className="muted">批次 {batch.id}</p>{batch.source_windows.map((window,index)=><p key={index}>源位置 {window.offset} · 读取 {window.received} 条 · 完整记录 {window.accepted} 条</p>)}{batch.decisions?.map(decision=><p key={decision.patentId}>{decision.patentId} · {decision.choice==='keep-manual'?'保留手工内容':'接受来源记录'}</p>)}</details>)}
 </details>;
}
