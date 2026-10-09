'use client';
import {useEffect,useState} from 'react';
import {LoaderCircle,CheckCircle2,PauseCircle,ChevronDown} from 'lucide-react';
import type {Run} from '@/lib/types';
export default function ExecutionProgress({run,title,onStop}:{run:Run;title:string;onStop?:()=>void}){
 const [now,setNow]=useState(()=>Date.now());
 useEffect(()=>{if(run.status!=='running')return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[run.status]);
 const p=run.progress,known=p?.total!==undefined&&p.total>0&&p.done!==undefined;
 const elapsed=Math.max(0,Math.floor((now-Date.parse(run.createdAt))/1000));
 const successful=run.results.filter(r=>r.status==='completed').length;
 const Icon=run.status==='running'?LoaderCircle:run.status==='completed'?CheckCircle2:PauseCircle;
 return <section className="execution-status" aria-label="工具执行进度">
 <details><summary><Icon size={16} className={run.status==='running'?'execution-spinner':''}/><strong role="status">{run.status==='running'?title:run.status==='completed'?'执行完成':run.status==='cancelled'?'已停止':'执行已结束'}</strong><span className="execution-metric">{run.status==='running'?`${elapsed} 秒`:''}{known&&` · ${p!.done}/${p!.total}（${Math.floor(p!.done!/p!.total!*100)}%）`}</span><span className="execution-expand">详情 <ChevronDown size={13}/></span></summary>
 <div className="execution-detail"><p>{p?.unit||'正在准备任务'}</p><p>{run.plan.length?`已结束 ${run.results.length}/${run.plan.length} 项，成功 ${successful} 项`:'正在制定计划'}{p?.reused!==undefined&&` · 复用 ${p.reused} 个断点`}</p>{run.status==='cancelled'&&<p>可按原参数继续运行。</p>}</div></details>
 {run.status==='running'&&onStop&&<button onClick={onStop}>停止任务</button>}
 </section>;
}
