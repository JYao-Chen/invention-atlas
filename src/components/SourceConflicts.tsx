'use client';
import {useEffect,useRef,useState} from 'react';
import {sourceFieldNames,sourceVersionChanges,sourceValueText} from '../lib/source-version-diff';
type Choice='keep-manual'|'accept-source';
type Pending={resolved:boolean;records:number;observedAt:string;sourceName:string;conflicts:{patentId:string;editedFields:string[];currentRecord:Record<string,unknown>;sourceRecord:Record<string,unknown>}[]};
export default function SourceConflicts({runId,readOnly,disabled,onResolved}:{runId:string;readOnly:boolean;disabled:boolean;onResolved:()=>void}){
 const [open,setOpen]=useState(false),[revision,setRevision]=useState(0),[data,setData]=useState<Pending>(),[choices,setChoices]=useState<Record<string,Choice>>({}),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');const request=useRef<AbortController|null>(null);
 useEffect(()=>()=>request.current?.abort(),[]);
 useEffect(()=>{
  if(!open)return;const control=new AbortController();setLoading(true);setError('');
  void(async()=>{try{const response=await fetch('/api/source-updates/'+runId+'/pending',{signal:control.signal}),result=await response.json();if(!response.ok)throw new Error(result.error||'读取待处理来源失败');if(!control.signal.aborted){setData(result);setChoices({});}}catch(e){if(!control.signal.aborted)setError((e as Error).message);}finally{if(!control.signal.aborted)setLoading(false);}})();return()=>control.abort();
 },[open,runId,revision]);
 async function confirm(){
  if(!data||request.current)return;const control=new AbortController();request.current=control;setBusy(true);setError('');
  try{const response=await fetch('/api/source-updates/'+runId+'/resolve',{method:'POST',signal:control.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({resolutions:data.conflicts.map(conflict=>({patentId:conflict.patentId,choice:choices[conflict.patentId],expectedRecord:conflict.currentRecord}))})}),result=await response.json();if(!response.ok)throw new Error(result.error||'确认来源更新失败');if(!control.signal.aborted){setData({...data,resolved:true});onResolved();}}
  catch(e){if(!control.signal.aborted)setError((e as Error).message);}finally{if(request.current===control){request.current=null;setBusy(false);}}
 }
 return <details className="source-conflicts" onToggle={event=>setOpen(event.currentTarget.open)}><summary>{readOnly?'查看待处理来源':'处理来源冲突'}</summary>
  {loading&&<p role="status">正在读取保存的来源快照…</p>}{error&&<p role="alert" className="error">{error}</p>}
  <button disabled={loading||busy} onClick={()=>{if(Object.keys(choices).length&&!window.confirm('重新读取会清空当前选择，是否继续？'))return;setRevision(value=>value+1);}}>重新读取冲突</button>
  {data&&<><p>{data.sourceName} · 获取于 {new Date(data.observedAt).toLocaleString('zh-CN')} · {data.records}条来源记录</p>
   {data.resolved?<p role="status">此来源快照已确认入库。</p>:<>
    <p className="muted">逐项选择保留手工内容或接受来源记录。接受来源会替换这件专利的来源字段，旧内容仍保存在版本历史中。</p>
    {!data.conflicts.length&&<p>当前没有手工修订冲突，可确认保存此批来源记录。</p>}
    {data.conflicts.map(conflict=><section key={conflict.patentId}><h4>{conflict.patentId}</h4><p className="muted">手工修改字段：{conflict.editedFields.map(field=>sourceFieldNames[field]||field).join('、')}</p>
     {sourceVersionChanges(conflict.currentRecord,conflict.sourceRecord).map(change=><details className="source-version-field" key={change.field}><summary>{change.label}</summary><dl><div><dt>当前手工内容</dt><dd>{sourceValueText(change.before)}</dd></div><div><dt>下载的来源内容</dt><dd>{sourceValueText(change.after)}</dd></div></dl></details>)}
     {!readOnly&&<fieldset disabled={disabled||busy||loading}><legend>{conflict.patentId} 的处理方式</legend><label><input type="radio" name={runId+':'+conflict.patentId} checked={choices[conflict.patentId]==='keep-manual'} onChange={()=>setChoices(value=>({...value,[conflict.patentId]:'keep-manual'}))}/>保留手工内容</label><label><input type="radio" name={runId+':'+conflict.patentId} checked={choices[conflict.patentId]==='accept-source'} onChange={()=>setChoices(value=>({...value,[conflict.patentId]:'accept-source'}))}/>接受来源记录</label></fieldset>}
    </section>)}
    {!readOnly&&<button disabled={disabled||busy||loading||data.conflicts.some(conflict=>!choices[conflict.patentId])} onClick={()=>{if(window.confirm('按上述选择确认整批来源记录？未冲突的记录也会在本批次更新。'))void confirm();}}>{busy?'正在确认…':'确认并入库'}</button>}
   </>}
  </>}
 </details>;
}
