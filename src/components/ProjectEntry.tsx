'use client';
import {useState} from 'react';
import AccountSettings from './AccountSettings';
import OrganizationManager from './OrganizationManager';
import UserManager from './UserManager';
import ReceivedReports from './ReceivedReports';
export type Workspace={user:{id:string;displayName:string;username:string;platformRole:string};projects:{id:string;organizationId:string;name:string;description:string;role:'owner'|'analyst'|'reader'}[];current:{id:string}|null};
const roles={owner:'负责人',analyst:'分析成员',reader:'只读成员'};
export default function ProjectEntry({workspace,onSelect,onReload,onLogout}:{workspace:Workspace;onSelect:(id:string)=>Promise<void>;onReload:()=>Promise<void>;onLogout:()=>Promise<void>}){
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function perform(work:()=>Promise<void>){setBusy(true);setError('');try{await work();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <main className="login"><section className="login-intro"><h1>专利分析平台</h1><p>{workspace.user.displayName} · 项目工作区</p><button onClick={()=>void onLogout()}>退出登录</button></section><section>
 <AccountSettings username={workspace.user.username} displayName={workspace.user.displayName}/><ReceivedReports/><OrganizationManager platformAdmin={workspace.user.platformRole==='admin'} onProjectCreated={onSelect} onChanged={onReload}/>{workspace.user.platformRole==='admin'&&<UserManager currentUserId={workspace.user.id}/>}<h2>选择项目</h2>
 {workspace.projects.length?workspace.projects.map(project=><div key={project.id}><button disabled={busy} onClick={()=>void perform(()=>onSelect(project.id))}>{project.name} · {roles[project.role]}</button>{project.description&&<p className="muted">{project.description}</p>}</div>):<p>尚未获得项目权限。加入组织后，请联系项目负责人分配访问权限。</p>}
 <form onSubmit={event=>{event.preventDefault();const token=String(new FormData(event.currentTarget).get('token')||'').trim();void perform(async()=>{const response=await fetch('/api/join',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});const data=await response.json();if(!response.ok)throw new Error(data.error);await onReload();});}}>
 <label>组织邀请码<input name="token" required autoComplete="off"/></label><button disabled={busy}>加入组织</button>
 </form><button disabled={busy} onClick={()=>void perform(onReload)}>刷新项目列表</button>{error&&<p role="alert" className="error">{error}</p>}
 </section></main>;
}
