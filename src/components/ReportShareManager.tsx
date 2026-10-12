'use client';
import {useState} from 'react';
type Recipient={id:string;name:string;username:string};
type Share={id:string;revision:number;edition:number|null;recipient_name:string;created_at:string;revoked_at:string|null};
export default function ReportShareManager({reportId,revision,edition}:{reportId:string;revision:number;edition?:number}){
 const [recipients,setRecipients]=useState<Recipient[]>([]),[shares,setShares]=useState<Share[]>([]),[recipient,setRecipient]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const endpoint='/api/reports/'+reportId+'/shares';
 async function read(path:string){const response=await fetch(path),data=await response.json();if(!response.ok)throw new Error(data.error||'读取分享失败');return data;}
 async function load(){setBusy(true);setError('');try{const [people,list]=await Promise.all([read(endpoint+'/recipients'),read(endpoint)]);setRecipients(people.recipients);setShares(list.shares);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function perform(id?:string){if(id&&!window.confirm('撤销这份报告的分享？接收者将不能再次在线读取或下载，已下载文件无法收回。'))return;setBusy(true);setError('');setMessage('');try{const response=await fetch(endpoint+(id?'/'+id:''),{method:id?'DELETE':'POST',headers:{'Content-Type':'application/json'},body:id?undefined:JSON.stringify({...edition?{edition}:{revision},recipientId:recipient})}),data=await response.json();if(!response.ok)throw new Error(data.error||'分享操作失败');setShares((await read(endpoint)).shares);setMessage(id?'已撤销分享。':'已分享当前固定版本。');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <details className="report-share-manager" onToggle={e=>{if(e.currentTarget.open)void load();}}><summary>定向分享</summary>
  <p className="muted">分享{edition?'发布第'+edition+'版':revision?'草稿第'+revision+'版':'原始报告'}的固定快照，不授予项目访问权限。仅同组织登录用户可接收；撤销不能收回已下载文件。</p>
  <form onSubmit={e=>{e.preventDefault();void perform();}}><label>接收者<select aria-label="报告接收者" value={recipient} onChange={e=>setRecipient(e.target.value)} disabled={busy} required><option value="">选择组织成员</option>{recipients.map(person=><option key={person.id} value={person.id}>{person.name} · {person.username}</option>)}</select></label><button disabled={busy||!recipient}>分享当前版本</button></form>
  {shares.filter(share=>edition?share.edition===edition:!share.edition).map(share=><section key={share.id}><p>{share.recipient_name} · {share.edition?'发布第'+share.edition+'版':share.revision?'草稿第'+share.revision+'版':'原始报告'} · {new Date(share.created_at).toLocaleString()}</p>{share.revoked_at?<p className="muted">已撤销</p>:<button disabled={busy} onClick={()=>void perform(share.id)}>撤销分享</button>}</section>)}
  {message&&<p role="status">{message}</p>}{error&&<p role="alert" className="error">{error}</p>}
 </details>;
}
