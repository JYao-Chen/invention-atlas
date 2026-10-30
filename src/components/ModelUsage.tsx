'use client';
import {useEffect,useRef,useState} from 'react';

type Summary={kind:string;model:string;provider:string;calls:string;completed:string;failed:string;cancelled:string;known_total_tokens:string|null;unknown_total_calls:string};
type RecordRow={id:string;kind:string;model:string;status:string;total_tokens:string|null;created_at:string};
type Usage={records:RecordRow[];summary:Summary[];offset:number;nextOffset:number|null};
const count=(value:string|null)=>value===null?'未知':BigInt(value).toLocaleString();
const status:Record<string,string>={completed:'完成',failed:'失败',cancelled:'取消'};

/** Operate: extend the incumbent settings panel. Tables distinguish measured tokens from unknown usage; no monetary estimates. */
export default function ModelUsage({projectName}:{projectName:string}){
 const [data,setData]=useState<Usage>(),[busy,setBusy]=useState(true),[error,setError]=useState('');
 const [from,setFrom]=useState(''),[to,setTo]=useState('');
 const request=useRef<AbortController|null>(null),applied=useRef({from:'',to:''});
 async function load(offset=0,range=applied.current){
  request.current?.abort();const controller=new AbortController();request.current=controller;setBusy(true);setError('');setData(undefined);
  try{
   const params=new URLSearchParams({offset:String(offset)});
   if(range.from)params.set('from',new Date(range.from).toISOString());
   if(range.to)params.set('to',new Date(range.to).toISOString());
   const response=await fetch('/api/model-usage?'+params,{signal:controller.signal});
   const body=await response.json();if(!response.ok)throw new Error(body.error||'读取用量失败');
   if(!controller.signal.aborted){setData(body);applied.current=range;}
  }catch(e){if(!controller.signal.aborted)setError((e as Error).message);}finally{if(!controller.signal.aborted)setBusy(false);}
 }
 useEffect(()=>{void load();return()=>request.current?.abort();},[]);
 return <section className="settings-panel model-usage" aria-labelledby="model-usage-title">
  <h3 id="model-usage-title">项目模型用量</h3>
  <p>{projectName} · 仅统计已保存的调用。Token来自模型服务返回，未知用量单独列出。</p>
  <form className="model-usage-filter" onSubmit={e=>{e.preventDefault();void load(0,{from,to});}}>
   <label>开始时间<input type="datetime-local" value={from} onChange={e=>setFrom(e.target.value)} disabled={busy}/></label>
   <label>结束时间（不包含）<input type="datetime-local" value={to} onChange={e=>setTo(e.target.value)} disabled={busy}/></label>
   <button disabled={busy}>查询用量</button>
  </form>
  {busy&&<p role="status">正在读取用量…</p>}
  {error&&<div role="alert"><p>{error}</p><button onClick={()=>void load(0,{from,to})}>重新读取</button></div>}
  {data&&<>
   {!data.summary.length?<p>所选时间内尚无调用记录。完成分析或建立索引后，可在这里查询。</p>:<div className="model-usage-scroll" tabIndex={0} role="region" aria-label="模型用量汇总"><table><caption>所选时间范围汇总</caption><thead><tr><th scope="col">模型</th><th scope="col">调用</th><th scope="col">完成／失败／取消</th><th scope="col">已知总Token</th><th scope="col">未知用量调用</th></tr></thead><tbody>{data.summary.map(row=><tr key={row.kind+row.model+row.provider}><th scope="row">{row.model}<small>{row.kind==='embedding'?'嵌入':'对话'} · {row.provider}</small></th><td>{count(row.calls)}</td><td>{row.completed}／{row.failed}／{row.cancelled}</td><td>{count(row.known_total_tokens)}</td><td>{count(row.unknown_total_calls)}</td></tr>)}</tbody></table></div>}
   {!!data.records.length&&<div className="model-usage-scroll" tabIndex={0} role="region" aria-label="模型调用明细"><table><caption>调用明细</caption><thead><tr><th scope="col">时间</th><th scope="col">模型</th><th scope="col">状态</th><th scope="col">总Token</th></tr></thead><tbody>{data.records.map(row=><tr key={row.id}><td>{new Date(row.created_at).toLocaleString()}</td><td>{row.model}</td><td>{status[row.status]||row.status}</td><td>{count(row.total_tokens)}</td></tr>)}</tbody></table></div>}
   <div className="settings-actions"><button disabled={busy||data.offset===0} onClick={()=>void load(Math.max(0,data.offset-50))}>上一页</button><span>第 {Math.floor(data.offset/50)+1} 页</span><button disabled={busy||data.nextOffset===null} onClick={()=>void load(data.nextOffset!)}>下一页</button></div>
  </>}
 </section>;
}
