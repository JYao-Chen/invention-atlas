'use client';
import {useEffect,useRef,useState} from 'react';
type Credential={id:string;name:string;access:'read'|'write';expiresAt:string;revokedAt:string|null};
export default function ApiCredentials({projectName,readOnly,openRequest}:{projectName:string;readOnly:boolean;openRequest?:number}){
 const dialog=useRef<HTMLDialogElement>(null),[items,setItems]=useState<Credential[]>([]),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[secret,setSecret]=useState(''),[copied,setCopied]=useState(false);
 async function request(path='',options?:RequestInit){const response=await fetch('/api/api-credentials'+path,options);const data=await response.json();if(!response.ok)throw new Error(data.error||'凭据操作失败');return data;}
 async function open(){setSecret('');setCopied(false);setError('');setItems([]);setLoaded(false);dialog.current?.showModal();setBusy(true);try{setItems((await request()).credentials);setLoaded(true);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 useEffect(()=>{if(openRequest)void open();},[openRequest]);
 function close(){if(secret&&!confirm('关闭后无法再次查看此密钥。确认已保存并关闭？'))return;setSecret('');dialog.current?.close();}
 async function create(form:HTMLFormElement){const values=new FormData(form);setBusy(true);setError('');try{const result=await request('',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:values.get('name'),access:values.get('access'),days:Number(values.get('days'))})});setSecret(result.token);setCopied(false);setItems(previous=>[result.credential,...previous]);form.reset();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function revoke(item:Credential){if(!confirm('撤销“'+item.name+'”后，使用此凭据的客户端将无法继续访问。确认撤销？'))return;setBusy(true);setError('');try{await request('/'+item.id,{method:'DELETE'});setItems(previous=>previous.map(row=>row.id===item.id?{...row,revokedAt:new Date().toISOString()}:row));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <><button onClick={()=>void open()}>接口凭据</button><dialog ref={dialog} className="workspace-manager api-credential-manager" aria-labelledby="api-credential-title" onCancel={event=>{event.preventDefault();if(!busy)close();}}>
  <header><h2 id="api-credential-title">接口凭据</h2><button disabled={busy} onClick={close}>关闭</button></header>
  <p>项目：{projectName}</p><p className="muted">外部客户端使用凭据访问此项目。凭据不会随浏览器切换项目，权限受当前成员角色限制。</p>
  {error&&<p className="error" role="alert">{error}</p>}
  {secret&&<section aria-label="新建密钥"><h3>保存密钥</h3><p>密钥仅显示一次。请保存到客户端的私有配置中，不要写入公开仓库。</p><textarea aria-label="新建接口密钥" readOnly value={secret} rows={3}/><button disabled={busy} onClick={async()=>{try{await navigator.clipboard.writeText(secret);setCopied(true);}catch{setError('无法复制，请选中密钥手动复制。');}}}>{copied?'已复制':'复制密钥'}</button></section>}
  {!secret&&<form onSubmit={event=>{event.preventDefault();void create(event.currentTarget);}}><h3>创建凭据</h3>
   <label>名称<input name="name" required maxLength={100} disabled={busy} placeholder="例如研究客户端"/></label>
   <label>访问权限<select name="access" disabled={busy}><option value="read">只读：读取已有数据和结果</option>{!readOnly&&<option value="write">读写：允许分析、检索和修改数据</option>}</select></label>
   <label>有效天数<input name="days" type="number" min={1} max={365} defaultValue={90} required disabled={busy}/></label><button className="primary" disabled={busy}>{busy?'正在处理…':'创建凭据'}</button>
  </form>}
  <section><h3>已有凭据</h3>{busy&&<p role="status">正在处理…</p>}{!busy&&!loaded&&<p className="muted">列表读取失败，请关闭后重新打开以重试。</p>}{!busy&&loaded&&!items.length&&<p className="muted">此项目尚无接口凭据。</p>}<ul className="api-credential-list">{items.map(item=>{const expired=new Date(item.expiresAt).getTime()<=Date.now();return <li key={item.id}><div><strong>{item.name}</strong><p className="muted">{item.access==='read'?'只读':'读写'} · {item.revokedAt?'已撤销':expired?'已到期':'有效至 '+new Date(item.expiresAt).toLocaleDateString()}</p></div><button disabled={busy||Boolean(item.revokedAt)||expired} onClick={()=>void revoke(item)}>撤销</button></li>;})}</ul></section>
 </dialog></>;
}
