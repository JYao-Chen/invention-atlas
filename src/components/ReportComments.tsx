'use client';
import {useEffect,useState} from 'react';
type Comment={id:string;body:string;own:boolean;author_name:string;created_at:string;updated_at:string};
export default function ReportComments({reportId,revision,readOnly}:{reportId:string;revision:number;readOnly:boolean}){
 const [comments,setComments]=useState<Comment[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[body,setBody]=useState(''),[editing,setEditing]=useState<string>();
 const endpoint='/api/reports/'+reportId+'/comments';
 async function refresh(signal?:AbortSignal){const response=await fetch(endpoint+'?version='+revision,{signal}),data=await response.json();if(!response.ok)throw new Error(data.error||'读取批注失败');if(!signal?.aborted)setComments(data.comments);}
 useEffect(()=>{const controller=new AbortController();void refresh(controller.signal).catch(e=>{if(!controller.signal.aborted)setError((e as Error).message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[reportId,revision]);
 async function save(){setBusy(true);setError('');try{const response=await fetch(endpoint+(editing?'/'+editing:''),{method:editing?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({body,revision})}),data=await response.json();if(!response.ok)throw new Error(data.error||'保存批注失败');await refresh();setEditing(undefined);setBody('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function remove(comment:Comment){if(!window.confirm('删除这条批注？'))return;setBusy(true);setError('');try{const response=await fetch(endpoint+'/'+comment.id,{method:'DELETE'}),data=await response.json();if(!response.ok)throw new Error(data.error||'删除批注失败');await refresh();if(editing===comment.id){setEditing(undefined);setBody('');}}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <details className="report-comments"><summary>版本批注 · {comments.length}条</summary>
  <p className="muted">批注只关联{revision?'草稿第'+revision+'版':'原始报告'}，不修改报告正文。</p>
  {loading?<p role="status">正在读取批注…</p>:!comments.length&&<p className="muted">当前版本暂无批注。</p>}
  {comments.map(comment=><section key={comment.id} className="report-comment"><p className="muted">{comment.author_name} · {new Date(comment.updated_at).toLocaleString()}{comment.updated_at!==comment.created_at?' · 已编辑':''}</p><p className="report-comment-body">{comment.body}</p>{!readOnly&&comment.own&&<div className="record-actions"><button type="button" disabled={busy} onClick={()=>{setEditing(comment.id);setBody(comment.body);}}>修改批注</button><button type="button" disabled={busy} onClick={()=>void remove(comment)}>删除批注</button></div>}</section>)}
  {!readOnly&&<form onSubmit={e=>{e.preventDefault();void save();}}><label>{editing?'修改批注':'新增批注'}<textarea aria-label="批注正文" rows={3} required maxLength={10000} value={body} disabled={busy} onChange={e=>setBody(e.target.value)}/></label><div className="record-actions"><button type="submit" disabled={busy||!body.trim()}>{busy?'正在保存…':editing?'保存批注修改':'添加批注'}</button>{editing&&<button type="button" disabled={busy} onClick={()=>{setEditing(undefined);setBody('');}}>取消修改</button>}</div></form>}
  {error&&<p role="alert" className="error">{error}</p>}
 </details>;
}
