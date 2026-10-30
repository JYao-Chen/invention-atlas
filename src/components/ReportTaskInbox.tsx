'use client';
import {useRef,useState} from 'react';
type Task={id:string;title:string;body:string;report_id:string;revision:number;report_title:string;assignee_name:string;status:'open'|'in_progress'|'completed'|'cancelled'};
const statuses={open:'待处理',in_progress:'处理中',completed:'已完成',cancelled:'已取消'};
export default function ReportTaskInbox({onOpen}:{onOpen:(id:string,revision:number)=>Promise<void>}){
 const dialog=useRef<HTMLDialogElement>(null),request=useRef(0),[tasks,setTasks]=useState<Task[]>([]),[total,setTotal]=useState(0),[page,setPage]=useState(1),[mine,setMine]=useState(true),[bucket,setBucket]=useState<'active'|'all'>('active'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function load(nextPage=page,nextMine=mine,nextBucket=bucket){const version=++request.current;setBusy(true);setError('');try{const response=await fetch('/api/report-tasks?mine='+(nextMine?'1':'0')+'&bucket='+nextBucket+'&page='+nextPage),data=await response.json();if(!response.ok)throw new Error(data.error||'读取待办失败');if(version!==request.current)return;setTasks(data.tasks);setTotal(data.total);setPage(data.page);setMine(nextMine);setBucket(nextBucket);}catch(e){if(version===request.current)setError((e as Error).message);}finally{if(version===request.current)setBusy(false);}}
 async function open(task:Task){setBusy(true);setError('');try{await onOpen(task.report_id,task.revision);dialog.current?.close();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <><button onClick={()=>{dialog.current?.showModal();void load(1);}}>报告待办</button><dialog ref={dialog} className="workspace-manager" onClose={()=>{request.current++;setBusy(false);}}>
  <header><h2>报告待办</h2><button aria-label="关闭报告待办" onClick={()=>dialog.current?.close()}>关闭</button></header><p className="muted">当前项目内的版本任务。打开关联报告后处理，</p>
  <label>任务范围<select aria-label="待办任务范围" disabled={busy} value={mine?'mine':'project'} onChange={e=>void load(1,e.target.value==='mine',bucket)}><option value="mine">分配给我的</option><option value="project">项目全部</option></select></label>
  <label>任务状态<select aria-label="待办任务状态" disabled={busy} value={bucket} onChange={e=>void load(1,mine,e.target.value as 'active'|'all')}><option value="active">未完成</option><option value="all">全部状态</option></select></label><button disabled={busy} onClick={()=>void load()}>刷新报告待办</button>
  {busy&&<p role="status">正在读取…</p>}{error&&<p role="alert" className="error">{error}</p>}{!busy&&!error&&!tasks.length&&<p>当前筛选下暂无任务。</p>}
  {tasks.map(task=><section key={task.id}><h3>{task.title} · {statuses[task.status]}</h3><p className="muted">{task.report_title} · {task.revision?'草稿第'+task.revision+'版':'原始报告'} · {task.assignee_name}</p><p className="report-comment-body">{task.body}</p><button disabled={busy} onClick={()=>void open(task)}>打开关联报告</button></section>)}
  <div className="record-actions"><span>共{total}项 · 第{page}/{Math.max(1,Math.ceil(total/20))}页</span><button disabled={busy||page===1} onClick={()=>void load(page-1)}>上一页</button><button disabled={busy||page*20>=total} onClick={()=>void load(page+1)}>下一页</button></div>
 </dialog></>;
}
