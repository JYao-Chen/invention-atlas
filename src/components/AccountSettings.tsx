'use client';
import {useRef,useState} from 'react';
export default function AccountSettings({username,displayName}:{username:string;displayName:string}){
 const dialog=useRef<HTMLDialogElement>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(form:HTMLFormElement){
  const data=new FormData(form),newPassword=String(data.get('newPassword'));
  if(newPassword!==data.get('confirmation')){setError('两次输入的新密码不一致');return;}
  setBusy(true);setError('');
  try{
   const response=await fetch('/api/account',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({currentPassword:data.get('currentPassword'),newPassword})});
   const result=await response.json();if(!response.ok)throw new Error(result.error||'修改密码失败');
   form.reset();dialog.current?.close();window.location.reload();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <><button onClick={()=>{setError('');dialog.current?.showModal();}}>账号设置</button><dialog ref={dialog} className="workspace-manager" onCancel={event=>{if(busy)event.preventDefault();}}>
  <header><h2>账号设置</h2><button disabled={busy} onClick={()=>dialog.current?.close()} aria-label="关闭账号设置">关闭</button></header>
  <p>{displayName} · {username}</p><h3>修改密码</h3><p className="muted">修改后所有已登录会话失效，需要使用新密码重新登录。</p>
  <form onSubmit={event=>{event.preventDefault();void submit(event.currentTarget);}}>
   <label>当前密码<input type="password" name="currentPassword" required autoComplete="current-password" disabled={busy}/></label>
   <label>新密码<input type="password" name="newPassword" required minLength={10} maxLength={1024} autoComplete="new-password" disabled={busy}/></label>
   <label>确认新密码<input type="password" name="confirmation" required minLength={10} maxLength={1024} autoComplete="new-password" disabled={busy}/></label>
   {error&&<p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy?'正在修改…':'修改密码并重新登录'}</button>
  </form>
 </dialog></>;
}
