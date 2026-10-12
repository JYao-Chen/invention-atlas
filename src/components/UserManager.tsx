'use client';
import {useRef,useState} from 'react';
type User={id:string;username:string;displayName:string;platformRole:'admin'|'member';enabled:boolean};
async function api(path:string,body?:unknown){const response=await fetch('/api/'+path,{method:body?'PATCH':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const data=await response.json();if(!response.ok)throw new Error(data.error||'请求失败');return data;}
export default function UserManager({currentUserId}:{currentUserId:string}){
 const dialog=useRef<HTMLDialogElement>(null),[users,setUsers]=useState<User[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[query,setQuery]=useState(''),[resetTarget,setResetTarget]=useState<User>();
 async function perform(work:()=>Promise<void>){setBusy(true);setError('');setMessage('');try{await work();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function refresh(){setUsers((await api('users')).users);}
 return <><button onClick={()=>{setQuery('');setResetTarget(undefined);dialog.current?.showModal();void perform(refresh);}}>平台账号</button><dialog ref={dialog} className="workspace-manager" onClose={()=>setResetTarget(undefined)} onCancel={e=>{if(busy)e.preventDefault();}}>
  <header><h2>平台账号</h2><button disabled={busy} onClick={()=>dialog.current?.close()} aria-label="关闭账号管理">关闭</button></header>
  <label>查找账号<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="用户名或显示名称"/></label>
  <ul className="workspace-members">{users.filter(user=>(user.username+' '+user.displayName).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).map(user=><li key={user.id}><span>{user.displayName}<small> · {user.username} · {user.platformRole==='admin'?'平台管理员':'用户'} · {user.enabled?'已启用':'已停用'}</small></span><button disabled={busy||user.id===currentUserId} onClick={()=>{const enabled=!user.enabled;if(window.confirm((enabled?'启用':'停用')+'账号 '+user.username+'？'+(!enabled?'其所有登录会话将失效。':'')))void perform(async()=>{await api('users/'+user.id,{action:'enabled',enabled});await refresh();setMessage('账号已'+(enabled?'启用':'停用'));});}}>{user.enabled?'停用':'启用'}</button><button disabled={busy||user.id===currentUserId} onClick={()=>{setResetTarget(user);setError('');setMessage('');}}>重置密码</button></li>)}</ul>
  {resetTarget&&<form key={resetTarget.id} onSubmit={e=>{e.preventDefault();const form=e.currentTarget,fields=new FormData(form),password=String(fields.get('password'));if(password!==fields.get('confirmation')){setError('两次输入的密码不一致');return;}if(!window.confirm('重置 '+resetTarget.username+' 的密码并撤销其所有会话？'))return;void perform(async()=>{await api('users/'+resetTarget.id,{action:'reset-password',password});form.reset();setResetTarget(undefined);setMessage('密码已重置，该用户需要重新登录。');});}}>
   <h3>重置 {resetTarget.displayName} 的密码</h3><label>新密码<input type="password" name="password" minLength={10} maxLength={1024} autoComplete="new-password" required disabled={busy}/></label><label>确认新密码<input type="password" name="confirmation" minLength={10} maxLength={1024} autoComplete="new-password" required disabled={busy}/></label><button disabled={busy}>确认重置密码</button><button type="button" disabled={busy} onClick={()=>setResetTarget(undefined)}>取消重置</button>
  </form>}
  {message&&<p role="status">{message}</p>}{error&&<p role="alert" className="error">{error}</p>}
 </dialog></>;
}
