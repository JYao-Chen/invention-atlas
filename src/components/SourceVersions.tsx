'use client';
import {useEffect,useState} from 'react';
import {sourceVersionChanges,sourceValueText} from '../lib/source-version-diff';
type Version={id:string;revision:number;batch_id:string;source_name:string;source_url:string;observed_at:string;before_record:Record<string,unknown>|null;after_record:Record<string,unknown>};
type Page={versions:Version[];page:number;pages:number;total:number};
export default function SourceVersions({datasetId,patentId}:{datasetId:string;patentId:string}){
 const [open,setOpen]=useState(false),[page,setPage]=useState(1),[reload,setReload]=useState(0),[data,setData]=useState<Page>(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  if(!open)return;const control=new AbortController();setBusy(true);setError('');
  void(async()=>{try{const response=await fetch(`/api/source-updates/${encodeURIComponent(patentId)}/versions?${new URLSearchParams({dataset:datasetId,page:String(page)})}`,{signal:control.signal}),result=await response.json();if(!response.ok)throw new Error(result.error||'读取来源版本失败');if(!control.signal.aborted)setData(result);}catch(e){if(!control.signal.aborted)setError((e as Error).message);}finally{if(!control.signal.aborted)setBusy(false);}})();
  return()=>control.abort();
 },[open,datasetId,patentId,page,reload]);
 return <details className="source-versions" onToggle={event=>setOpen(event.currentTarget.open)}><summary>来源版本与修改内容{data?` · ${data.total}版`:''}</summary>
  <p className="muted">保存来源更新前后的记录。获取时点为本系统读取数据的时间，不代表官方修订或法律状态变更时间。</p>
  <button disabled={busy} onClick={()=>setReload(value=>value+1)}>刷新来源版本</button>
  {busy&&<p role="status">正在读取来源版本…</p>}{error&&<p className="error" role="alert">{error}</p>}
  {data&&!data.versions.length&&<p className="muted">尚无来源更新版本。初始导入及手工修改不会自动成为来源更新版本。</p>}
  {data?.versions.map(version=>{const changes=sourceVersionChanges(version.before_record,version.after_record);return <details key={version.id} className="source-version"><summary>第{version.revision}版 · {new Date(version.observed_at).toLocaleString('zh-CN')} · {version.before_record?`${changes.length}项内容变化`:'首次来源入库'}</summary>
   <p>{version.source_name} · <a href={version.source_url} target="_blank" rel="noreferrer">打开数据来源</a></p><p className="muted">入库批次 {version.batch_id}</p>
   {changes.map(change=><details key={change.field} className="source-version-field"><summary>{change.label}</summary><dl><div><dt>更新前</dt><dd>{sourceValueText(change.before)}</dd></div><div><dt>更新后</dt><dd>{sourceValueText(change.after)}</dd></div></dl></details>)}
  </details>;})}
  {data&&data.pages>1&&<div className="pagination"><button disabled={busy||data.page<=1} onClick={()=>setPage(data.page-1)}>上一页版本</button><span>{data.page}/{data.pages}页</span><button disabled={busy||data.page>=data.pages} onClick={()=>setPage(data.page+1)}>下一页版本</button></div>}
 </details>;
}
