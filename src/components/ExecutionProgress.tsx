'use client';
import {useEffect,useState} from 'react';
import type {Run} from '@/lib/types';
export default function ExecutionProgress({run,title,onStop}:{run:Run;title:string;onStop:()=>void}){
 const [now,setNow]=useState(()=>Date.now());
 useEffect(()=>{if(run.status!=='running')return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[run.status]);
 const p=run.progress,known=p?.total!==undefined&&p.total>0&&p.done!==undefined,elapsed=Math.max(0,Math.floor((now-Date.parse(run.createdAt))/1000));
 const ended=run.results.length,successful=run.results.filter(r=>r.status==='completed').length;
 return <section className="execution-progress" aria-label="工具执行进度"><header><strong>{title}</strong><span>{run.status==='running'?`已用时 ${elapsed} 秒`:run.status==='completed'?'执行完成':run.status==='cancelled'?'已停止，可按原参数续跑':'已结束，请查看结果说明'}</span></header>
 <p>{run.status==='running'?p?.unit||'正在准备任务':known?p!.unit:'本次执行已结束'}{known&&<span> · {p!.done}/{p!.total} · {Math.floor(p!.done!/p!.total!*100)}%</span>}{p?.reused!==undefined&&<span> · 复用 {p.reused} 个断点</span>}</p>
 <progress aria-label="当前步骤进度" max={known?p!.total:1} value={known?p!.done:run.status==='running'?undefined:run.status==='completed'?1:0}/>
 <footer><span>{run.plan.length?`已结束 ${ended}/${run.plan.length} 项，成功 ${successful} 项`:'正在制定计划'}{run.status==='running'&&!known?' · 等待当前步骤返回':''}</span>{run.status==='running'&&<button onClick={onStop}>停止任务</button>}</footer>
 </section>;
}
