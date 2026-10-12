'use client';
import {useEffect,useRef,useState} from 'react';
import type {Workspace} from './ProjectEntry';
type Member={id:string;username:string;displayName:string;enabled:boolean;role:'owner'|'analyst'|'reader'};
type Organization={id:string;name:string;role:'admin'|'member'};
async function api(path:string,body?:unknown,method?:string){const response=await fetch('/api/'+path,{method:method||(body?'POST':'GET'),headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const data=await response.json();if(!response.ok)throw new Error(data.error||'请求失败');return data;}
const roles={owner:'负责人',analyst:'分析成员',reader:'只读成员'};
export default function WorkspaceManager({workspace,onSelect}:{workspace:Workspace;onSelect:(id:string)=>Promise<void>}){
 const dialog=useRef<HTMLDialogElement>(null),[open,setOpen]=useState(false),[members,setMembers]=useState<Member[]>([]),[organizations,setOrganizations]=useState<Organization[]>([]),[candidates,setCandidates]=useState<Member[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[invite,setInvite]=useState('');
 const project=workspace.projects.find(p=>p.id===workspace.current?.id);
 const organizationId=organizations.find(o=>o.id===project?.organizationId&&o.role==='admin')?.id;
 async function refresh(isCurrent=()=>true){const [memberData,organizationData,candidateData]=await Promise.all([project?api('projects/'+project.id+'/members'):Promise.resolve({members:[]}),api('organizations'),project?.role==='owner'?api('projects/'+project.id+'/candidates'):Promise.resolve({members:[]})]);if(!isCurrent())return;setMembers(memberData.members);setOrganizations(organizationData.organizations);setCandidates(candidateData.members);}
 async function perform(work:()=>Promise<void>){setBusy(true);setError('');try{await work();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close();},[open]);
 useEffect(()=>{if(!open)return;let current=true;setMembers([]);setCandidates([]);setOrganizations([]);setInvite('');setBusy(true);setError('');void refresh(()=>current).catch(e=>{if(current)setError((e as Error).message);}).finally(()=>{if(current)setBusy(false);});return()=>{current=false;};},[open,project?.id,project?.role]);
 return <><button onClick={()=>setOpen(true)} aria-label="项目与成员">项目与成员</button><dialog ref={dialog} className="workspace-manager" onCancel={()=>setOpen(false)} onClose={()=>setOpen(false)}>
 <header><h2>项目与成员</h2><button onClick={()=>setOpen(false)} aria-label="关闭项目管理">关闭</button></header>
 <p>{workspace.user.displayName} · {project?.name}</p>
 <label>当前项目<select value={project?.id||''} disabled={busy} onChange={e=>void perform(()=>onSelect(e.target.value))}>{workspace.projects.map(p=><option key={p.id} value={p.id}>{p.name} · {roles[p.role]}</option>)}</select></label>
 <h3>项目成员</h3><ul className="workspace-members">{members.map(member=><li key={member.id}><span>{member.displayName} <small>{member.username}{!member.enabled?' · 已停用':''}</small></span>{project?.role==='owner'?<><select aria-label={member.displayName+'的项目角色'} value={member.role} disabled={busy} onChange={e=>void perform(async()=>{await api('projects/'+project.id+'/members',{userId:member.id,role:e.target.value},'PATCH');await refresh();})}>{Object.entries(roles).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><button disabled={busy} onClick={()=>{if(confirm('移除 '+member.displayName+' 的项目访问权限？'))void perform(async()=>{await api('projects/'+project.id+'/members',{userId:member.id},'DELETE');await refresh();});}}>移除</button></>:<span>{roles[member.role]}</span>}</li>)}</ul>
 {project?.role==='owner'&&<form onSubmit={e=>{e.preventDefault();const userId=String(new FormData(e.currentTarget).get('userId'));void perform(async()=>{await api('projects/'+project.id+'/members',{userId,role:'analyst'},'PATCH');await refresh();});}}><label>添加组织成员<select name="userId" required disabled={busy}><option value="">选择成员</option>{candidates.filter(c=>!members.some(m=>m.id===c.id)&&c.enabled).map(c=><option key={c.id} value={c.id}>{c.displayName} · {c.username}</option>)}</select></label><button disabled={busy}>添加为分析成员</button></form>}
 {organizationId&&<section><h3>邀请加入组织</h3><button disabled={busy} onClick={()=>void perform(async()=>{const result=await api('invites',{organizationId});setInvite(result.token);})}>生成邀请码</button>{invite&&<label>邀请码（48小时有效，仅可使用一次）<input readOnly value={invite} onFocus={e=>e.target.select()}/></label>}</section>}
 {error&&<p className="error" role="alert">{error}</p>}
 </dialog></>;
}
