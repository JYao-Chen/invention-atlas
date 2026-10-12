'use client';
import {useEffect,useState} from 'react';
import type {Params} from '../lib/types';
import type {MonitorNotificationSnapshot} from '../server/monitor-notification-snapshot';
import MonitorNotificationBody from './MonitorNotificationBody';
import MonitorStrategyFields from './MonitorStrategyFields';
import MonitorStrategyEditor from './MonitorStrategyEditor';
import {monitorParamsFromForm} from '../lib/monitor-form';
type Subscription={id:string;name:string;dataset_id:string;params:Params;strategy_revision:number;enabled:boolean;interval_hours:number;next_run_at:string;last_run_id:string|null};
type Notice={id:string;subscription_id:string|null;name:string;run_id:string;run_available:boolean;read_at:string|null;created_at:string;snapshot:MonitorNotificationSnapshot};
async function api(path:string,method='GET',body?:unknown,signal?:AbortSignal){const response=await fetch('/api/'+path,{method,signal,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const data=await response.json();if(!response.ok)throw new Error(data.error||'监测操作失败');return data;}
export default function MonitorSubscriptions({datasets,readOnly,onOpenRun}:{datasets:{id:string;name:string}[];readOnly:boolean;onOpenRun:(id:string)=>Promise<void>}){
 const [subscriptions,setSubscriptions]=useState<Subscription[]>([]),[notices,setNotices]=useState<Notice[]>([]),[busy,setBusy]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [noticePage,setNoticePage]=useState(1),[noticePages,setNoticePages]=useState(1),[noticeTotal,setNoticeTotal]=useState(0),[noticeUnread,setNoticeUnread]=useState(0),[onlyUnread,setOnlyUnread]=useState(false);
 const [showArchived,setShowArchived]=useState(false);
 async function refresh(signal?:AbortSignal,page=noticePage,unread=onlyUnread,archived=showArchived){const [s,n]=await Promise.all([api('monitor-subscriptions','GET',undefined,signal),api('monitor-notifications?page='+page+'&unread='+(unread?'1':'0')+'&archived='+(archived?'1':'0'),'GET',undefined,signal)]);setSubscriptions(s.subscriptions);setNotices(n.notifications);setNoticePage(n.page);setNoticePages(n.pages);setNoticeTotal(n.total);setNoticeUnread(n.unread);setOnlyUnread(unread);setShowArchived(archived);}
 useEffect(()=>{const controller=new AbortController();void refresh(controller.signal).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setBusy(false);});return()=>controller.abort();},[]);
 async function perform(work:()=>Promise<void>,page=noticePage,unread=onlyUnread,archived=showArchived){setBusy(true);setError('');setMessage('');try{await work();await refresh(undefined,page,unread,archived);return true;}catch(e){setError((e as Error).message);return false;}finally{setBusy(false);}}
 async function paginate(page:number,unread=onlyUnread,archived=showArchived){const previousUnread=onlyUnread,previousArchived=showArchived;setOnlyUnread(unread);setShowArchived(archived);if(!await perform(async()=>{},page,unread,archived)){setOnlyUnread(previousUnread);setShowArchived(previousArchived);}}
 return <details className="monitor-subscriptions"><summary>个人监测订阅 · {subscriptions.length}项 · {showArchived?'归档中':'待处理'}{noticeUnread}条未读</summary>
  <p className="muted">定期比较入库检索返回集。变化、执行失败和数据不足会保存通知；首次建立基线和无变化不通知。未连接外部实时专利数据。</p>
  <button disabled={busy} onClick={()=>paginate(noticePage)}>刷新监测状态</button>
  {!readOnly&&<details><summary>新建监测订阅</summary><form onSubmit={e=>{e.preventDefault();const form=e.currentTarget,values=new FormData(form);void perform(async()=>{await api('monitor-subscriptions','POST',{datasetId:values.get('datasetId'),name:values.get('name'),intervalHours:Number(values.get('intervalHours')),params:monitorParamsFromForm(values)});form.reset();setMessage('订阅已保存，后台将在到期扫描时执行。');});}}>
   <fieldset disabled={busy}><label>订阅名称<input name="name" required maxLength={200}/></label><label>监测数据集<select name="datasetId" aria-label="监测数据集" required><option value="">请选择数据集</option>{datasets.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>执行间隔（小时）<input name="intervalHours" type="number" min={1} max={8760} defaultValue={24} required/></label><MonitorStrategyFields/><button type="submit" disabled={!datasets.length}>保存监测订阅</button></fieldset>
  </form></details>}
  {subscriptions.map(item=><article key={item.id}><h4>{item.name}</h4><p>{item.enabled?'已启用':'已暂停'} · 每{item.interval_hours}小时 · 下次到期 {new Date(item.next_run_at).toLocaleString()}</p><p className="muted">{datasets.find(d=>d.id===item.dataset_id)?.name||item.dataset_id} · {item.params.query} · 返回上限{item.params.top_k}</p><div className="record-actions">
   {!readOnly&&<><button disabled={busy} onClick={()=>void perform(async()=>{await api('monitor-subscriptions/'+item.id,'PATCH',{enabled:!item.enabled});})}>{item.enabled?'暂停订阅':'恢复订阅'}</button><button disabled={busy||!item.enabled} onClick={()=>void perform(async()=>{await api('monitor-subscriptions/'+item.id+'/run','POST',{});setMessage('监测任务已提交，可打开最近运行查看进度。');})}>立即执行监测</button></>}
   {item.last_run_id&&<button disabled={busy} onClick={()=>void perform(()=>onOpenRun(item.last_run_id!))}>打开最近运行</button>}
  </div><MonitorStrategyEditor key={item.id+':'+item.strategy_revision} id={item.id} revision={item.strategy_revision} params={item.params} readOnly={readOnly} busy={busy} onReload={()=>perform(async()=>{})} onSave={(params,revision)=>perform(async()=>{const saved=await api('monitor-subscriptions/'+item.id,'PATCH',{params,expectedRevision:revision});setMessage('策略已保存为第'+saved.strategy_revision+'版；参数有变化时，下次运行建立独立基线。');})}/>
  {!readOnly&&<details><summary>调整与删除</summary><form onSubmit={e=>{e.preventDefault();const hours=Number(new FormData(e.currentTarget).get('hours'));void perform(async()=>{await api('monitor-subscriptions/'+item.id,'PATCH',{intervalHours:hours});});}}><label>执行间隔（小时）<input name="hours" type="number" required min={1} max={8760} defaultValue={item.interval_hours}/></label><button disabled={busy}>保存执行间隔</button></form><button disabled={busy} onClick={()=>{if(confirm('删除该个人订阅？已有运行和变化通知保留。'))void perform(async()=>{await api('monitor-subscriptions/'+item.id,'DELETE');});}}>删除订阅</button></details>}</article>)}
  <h4>监测通知</h4>
  <div className="record-actions monitor-notice-controls">
   <label><input type="checkbox" checked={showArchived} disabled={busy} onChange={e=>paginate(1,onlyUnread,e.target.checked)}/>查看归档</label>
   <label><input type="checkbox" checked={onlyUnread} disabled={busy} onChange={e=>paginate(1,e.target.checked)}/>只看未读</label>
   <span>共{noticeTotal}条 · 未读{noticeUnread}条 · 第{noticePage}/{noticePages}页</span>
   <button disabled={busy||noticePage===1} onClick={()=>paginate(noticePage-1)} aria-label="监测简报上一页">上一页</button>
   <button disabled={busy||noticePage>=noticePages} onClick={()=>paginate(noticePage+1)} aria-label="监测简报下一页">下一页</button>
  </div>
  {showArchived&&<p className="muted">归档保留通知内容和已读状态。恢复后可在普通通知列表查看。</p>}
  {!notices.length&&!busy&&<p className="muted">{onlyUnread?'当前没有未读通知。取消“只看未读”可查看历史通知。':showArchived?'尚无归档通知。':'尚无监测通知。可打开最近运行查看基线或无变化结果。'}</p>}
  {notices.map(item=><article key={item.id}>
   <h5>{item.name} · {item.read_at?'已读':'未读'}</h5>
   <p>{new Date(item.created_at).toLocaleString()}</p>
   <MonitorNotificationBody snapshot={item.snapshot}/>
   {!item.run_available&&<p className="muted">原运行已删除，通知内容仍可查阅。</p>}
   {item.snapshot.failure&&!readOnly&&!subscriptions.some(s=>s.id===item.subscription_id&&s.enabled)&&<p className="muted">订阅已暂停或删除；恢复订阅或新建订阅后可再次执行。</p>}
   <div className="record-actions">
    {item.run_available&&<button disabled={busy} onClick={()=>void perform(()=>onOpenRun(item.run_id))}>{item.snapshot.failure?'打开失败运行':'打开变化运行'}</button>}
    {item.snapshot.failure&&!readOnly&&subscriptions.some(s=>s.id===item.subscription_id&&s.enabled)&&<button disabled={busy} onClick={()=>void perform(async()=>{await api('monitor-subscriptions/'+item.subscription_id+'/run','POST',{});setMessage('监测任务已重新提交，使用订阅当前策略。');})}>重新执行监测</button>}
    {!item.read_at&&<button disabled={busy} onClick={()=>void perform(async()=>{await api('monitor-notifications/'+item.id,'PATCH',{action:'read'});})}>标记已读</button>}
    <button disabled={busy} onClick={()=>void perform(async()=>{await api('monitor-notifications/'+item.id,'PATCH',{action:showArchived?'restore':'archive'});setMessage(showArchived?'通知已恢复，可在普通通知列表查看。':'通知已归档，内容保留。');})}>{showArchived?'恢复通知':'归档通知'}</button>
   </div>
  </article>)}
  {busy&&<p role="status">正在处理监测操作…</p>}{message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}
 </details>;
}
