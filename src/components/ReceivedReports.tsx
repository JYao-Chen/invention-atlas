'use client';
import {useRef,useState} from 'react';
type Share={id:string;title:string;revision:number;created_at:string};
export default function ReceivedReports(){
 const dialog=useRef<HTMLDialogElement>(null),[shares,setShares]=useState<Share[]>([]),[selected,setSelected]=useState<Share>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[loaded,setLoaded]=useState(false);
 async function load(){setBusy(true);setError('');setSelected(undefined);try{const response=await fetch('/api/shared-reports'),data=await response.json();if(!response.ok)throw new Error(data.error||'读取收到的报告失败');setShares(data.reports);setLoaded(true);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function open(share:Share){setBusy(true);setError('');setSelected(undefined);try{const response=await fetch('/api/shared-reports/'+share.id),data=await response.json();if(!response.ok)throw new Error(data.error||'分享已失效');setSelected(share);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <><button onClick={()=>{dialog.current?.showModal();void load();}}>收到的报告</button><dialog ref={dialog} className="workspace-manager received-reports" onClose={()=>setSelected(undefined)}>
  <header><h2>收到的报告</h2><button aria-label="关闭收到的报告" onClick={()=>dialog.current?.close()}>关闭</button></header>
  <p className="muted">仅显示分享给你的固定报告版本，不提供原项目或数据集访问权限。</p><button disabled={busy} onClick={()=>void load()}>刷新收到的报告</button>
  {busy&&<p role="status">正在读取…</p>}{error&&<p role="alert" className="error">{error}</p>}{loaded&&!busy&&!shares.length&&<p>暂无有效分享。</p>}
  {shares.map(share=><section key={share.id}><h3>{share.title}</h3><p className="muted">{new Date(share.created_at).toLocaleString()}</p><button disabled={busy} onClick={()=>void open(share)}>阅读分享报告</button> <a className="button" href={'/api/shared-reports/'+share.id+'/html'}>下载分享 HTML</a></section>)}
  {selected&&<section><h3>{selected.title}</h3><iframe key={selected.id} title="分享报告正文与图表" src={'/api/shared-reports/'+selected.id+'/view'} sandbox="allow-scripts allow-downloads"/></section>}
 </dialog></>;
}
