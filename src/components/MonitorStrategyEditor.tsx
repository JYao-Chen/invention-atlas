'use client';
import {useEffect,useRef,useState} from 'react';
import type {Params} from '../lib/types';
import {monitorParamsFromForm} from '../lib/monitor-form';
import MonitorStrategyFields from './MonitorStrategyFields';
type Version={revision:number;params:Params;created_at:string};
export default function MonitorStrategyEditor({id,revision,params,readOnly,busy,onSave,onReload}:{id:string;revision:number;params:Params;readOnly:boolean;busy:boolean;onSave:(params:Params,revision:number)=>Promise<boolean>;onReload:()=>Promise<boolean>}){
 const [history,setHistory]=useState<Version[]>([]),[selected,setSelected]=useState(revision),[draft,setDraft]=useState(params),[dirty,setDirty]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const request=useRef<AbortController|null>(null);
 const [formVersion,setFormVersion]=useState(0);
 const latest=history[0]?.revision??revision,stale=latest!==revision;
 useEffect(()=>()=>request.current?.abort(),[]);
 async function load(){
  if(request.current)return;
  const task=new AbortController();request.current=task;setLoading(true);setError('');
  try{const response=await fetch('/api/monitor-subscriptions/'+id+'/versions',{signal:task.signal}),data=await response.json();if(!response.ok)throw new Error(data.error||'读取策略历史失败');if(!task.signal.aborted)setHistory(data.versions);}
  catch(e){if(!task.signal.aborted)setError((e as Error).message);}
  finally{if(request.current===task)request.current=null;if(!task.signal.aborted)setLoading(false);}
 }
 function select(next:number){if(dirty&&!confirm('放弃未保存的策略修改并切换版本？'))return;const version=history.find(item=>item.revision===next);if(!version)return;setSelected(next);setDraft(version.params);setDirty(false);}
 return <details className="monitor-strategy-editor" onToggle={e=>{if(e.currentTarget.open&&!history.length)void load();}}>
  <summary>检索策略 · 第{revision}版</summary>
  <p className="muted">修改参数会保存新版本，下次运行建立独立基线，不把范围变化计作新增专利。暂停订阅不会因保存策略而恢复。</p>
  <div className="record-actions">
   {history.length>0&&<label>查看策略版本<select aria-label="查看策略版本" value={selected} disabled={busy||loading} onChange={e=>select(Number(e.target.value))}>{history.map(item=><option key={item.revision} value={item.revision}>第{item.revision}版 · {new Date(item.created_at).toLocaleString()}</option>)}</select></label>}
   <button disabled={busy||loading} onClick={()=>{if(dirty&&!confirm('放弃未保存的策略修改并刷新订阅？'))return;void onReload().then(ok=>{if(ok){setDraft(params);setSelected(revision);setDirty(false);setFormVersion(value=>value+1);}});}}>刷新订阅版本</button>
  </div>
  {loading&&<p role="status">正在读取策略历史…</p>}{error&&<p role="alert">{error} <button disabled={loading} onClick={()=>void load()}>重试读取策略历史</button></p>}
  {stale&&<p role="status">服务器已有第{latest}版策略，请刷新订阅版本后修改。</p>}
  {selected!==revision&&<p className="muted">正在查看保存第{selected}版，仅供阅读，不会改变当前监测。</p>}
  {selected!==revision&&!readOnly&&<button disabled={busy||loading||stale} onClick={()=>{setSelected(revision);setDirty(true);}}>以此版本编辑新策略</button>}
  <form key={selected+':'+formVersion} onChange={()=>setDirty(true)} onSubmit={e=>{
   e.preventDefault();const values=monitorParamsFromForm(new FormData(e.currentTarget));
   if(values.year_start!==undefined&&values.year_end!==undefined&&Number(values.year_start)>Number(values.year_end)){setError('结束年份不能早于开始年份');return;}
   setError('');void onSave(values,revision).then(saved=>{if(saved)setDirty(false);});
  }}>
   <fieldset disabled={readOnly||busy||loading||stale||selected!==revision}><MonitorStrategyFields params={draft}/>
    {!readOnly&&selected===revision&&<button type="submit" disabled={!dirty}>保存策略版本</button>}
   </fieldset>
  </form>
  {dirty&&selected===revision&&<p className="muted">有未保存的策略修改。</p>}
 </details>;
}
