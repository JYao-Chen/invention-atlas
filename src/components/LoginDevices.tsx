'use client';
import {useEffect,useState} from 'react';
import {Monitor,Smartphone} from 'lucide-react';
type Device={id:string;userAgent:string;ipAddress:string;createdAt:number|null;lastActiveAt:number|null;expiresAt:number;current:boolean};
function deviceName(agent:string){
 const system=/Android/i.test(agent)?'Android':/iPhone|iPad/i.test(agent)?'iOS':/Windows/i.test(agent)?'Windows':/Macintosh|Mac OS X/i.test(agent)?'macOS':/Linux/i.test(agent)?'Linux':'';
 const browser=/Edg\//.test(agent)?'Edge':/OPR\//.test(agent)?'Opera':/Firefox\//.test(agent)?'Firefox':/Chrome\/|CriOS\//.test(agent)?'Chrome':/Safari\//.test(agent)?'Safari':'';
 return [browser,system].filter(Boolean).join(' / ')||agent||'设备信息未记录';
}
const time=(value:number|null)=>value===null?'未记录':new Date(value).toLocaleString('zh-CN',{hour12:false});
export default function LoginDevices({userId,username}:{userId?:string;username?:string}){
 const [devices,setDevices]=useState<Device[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const path='/api/login-devices'+(userId?'?userId='+encodeURIComponent(userId):'');
 async function load(){const response=await fetch(path,{cache:'no-store'}),data=await response.json();if(!response.ok)throw new Error(data.error||'读取登录设备失败');return data.devices as Device[];}
 useEffect(()=>{let active=true;setLoading(true);setError('');void load().then(value=>{if(active)setDevices(value);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[path]);
 async function refresh(){setLoading(true);setError('');try{setDevices(await load());}catch(e){setError((e as Error).message);}finally{setLoading(false);}}
 async function revoke(device?:Device){
  if(!window.confirm(device?'下线 '+deviceName(device.userAgent)+'？'+(device.current?'当前页面将退出登录。':'该设备再次访问时需要登录。'):(userId&&!devices.some(d=>d.current)?'下线 '+username+' 的所有设备？':'退出其他设备，保留当前登录？')))return;
  setBusy(true);setError('');setNotice('');
  try{const response=await fetch(path,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify(device?{id:device.id}:{others:true})}),data=await response.json();if(!response.ok)throw new Error(data.error||'下线失败');if(data.loginRequired){window.location.reload();return;}setDevices(await load());setNotice('已下线 '+data.count+' 个登录会话。');}catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <section className="login-devices" aria-label="登录设备">
  <div className="device-heading"><h3>{username?username+' 的登录设备':'登录设备'}</h3><div><button disabled={busy||loading} onClick={()=>void refresh()}>刷新</button><button disabled={busy||loading||!devices.some(d=>!d.current)} onClick={()=>void revoke()}>{userId&&!devices.some(d=>d.current)?'全部下线':'退出其他设备'}</button></div></div>
  <p className="muted">每次登录保留 7 天。下线后，该设备下次请求时需要重新登录。</p>
  {loading?<p role="status">正在读取登录设备…</p>:<ul className="device-list">{devices.map(device=><li key={device.id}>
   <span className="device-icon" aria-hidden="true">{/Android|iPhone|iPad/i.test(device.userAgent)?<Smartphone size={20}/>:<Monitor size={20}/>}</span>
   <div className="device-details"><div><strong title={device.userAgent}>{deviceName(device.userAgent)}</strong>{device.current&&<span className="device-current">当前设备</span>}</div><dl><div><dt>登录</dt><dd>{time(device.createdAt)}</dd></div><div><dt>最近活动</dt><dd>{time(device.lastActiveAt)}</dd></div><div><dt>到期</dt><dd>{time(device.expiresAt)}</dd></div><div><dt>IP</dt><dd>{device.ipAddress||'未记录'}</dd></div></dl></div>
   <button disabled={busy} onClick={()=>void revoke(device)}>{device.current?'退出登录':'下线'}</button>
  </li>)}{!devices.length&&<li>当前没有有效的登录会话。</li>}</ul>}
  {notice&&<p role="status">{notice}</p>}{error&&<p className="error" role="alert">{error}</p>}
 </section>;
}
