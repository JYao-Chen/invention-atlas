'use client';
import {useEffect,useState} from 'react';
import {Check,ChevronRight,Circle,LoaderCircle,TriangleAlert} from 'lucide-react';
import type {Run} from '../lib/types';
import ResearchTrail from './ResearchTrail';
export default function AnalysisProcess({run,onPatent,tools=[]}:{run:Run;onPatent:(id:string,datasetId:string)=>void;tools?:{name:string;title:string}[]}){
 const [open,setOpen]=useState(run.status==='running'&&!run.answer);
 useEffect(()=>{setOpen(run.status==='running'&&!run.answer);},[Boolean(run.answer),run.status]);
 const running=run.status==='running';
 const completed=run.results.filter(r=>r.status==='completed').length;
 const label=!running?'分析过程':run.answer?'正在撰写报告':run.progress?.tool==='request'?'正在提交问题':run.reportPreparation?'正在整理报告证据':run.plan.length?'正在计算分析指标':'正在确定研究范围';
 const StatusIcon=running?LoaderCircle:['failed','interrupted','partial'].includes(run.status)?TriangleAlert:run.status==='completed'?Check:Circle;
 return <details className="analysis-process" data-running={running} open={open} onToggle={e=>setOpen(e.currentTarget.open)}>
 <summary><StatusIcon size={15} className={running?'process-spinner':'process-symbol'} aria-hidden="true"/><span className="process-label">{label}</span>{run.plan.length>0&&<span className="process-count">{completed}/{run.plan.length} 项完成</span>}<ChevronRight size={14} className="process-chevron" aria-hidden="true"/></summary>
 <div className="analysis-process-body">
 {run.plan.length>0&&<ol className="process-steps">{run.plan.map((step,i)=>{const result=run.results.find(r=>r.tool===step.tool&&JSON.stringify(r.params)===JSON.stringify(step.params));const active=running&&run.progress?.tool===step.tool&&!result;const state=result?.status==='completed'?'completed':result?.status==='failed'||result?.status==='unavailable'?'limited':active?'active':'pending';const StepIcon=state==='completed'?Check:state==='limited'?TriangleAlert:active?LoaderCircle:Circle;return <li key={i} data-state={state}>
 <StepIcon size={14} className={active?'process-spinner':'process-step-icon'} aria-hidden="true"/><div className="process-step-content"><div className="process-step-heading"><strong>{result?.title||tools.find(t=>t.name===step.tool)?.title||step.tool}</strong><span>{result?.status==='completed'?'已完成':result?.status==='failed'?'失败':result?.status==='unavailable'?'数据不足':active?'执行中':running?'待执行':'未完成'}</span></div>{result&&<p>{result.summary}</p>}</div></li>;})}</ol>}
 {running&&!run.plan.length&&run.progress?.tool!=='request'&&<p className="process-preparing">正在确定研究范围、统计口径和所需工具。</p>}
 {run.progress&&running&&!run.answer&&<p className="process-live" role="status"><span>{run.progress.unit}</span>{run.progress.total!==undefined&&<span className="process-count">{run.progress.done||0}/{run.progress.total}</span>}</p>}
 <ResearchTrail run={run} onPatent={onPatent}/>
 {run.reportPreparation&&<p className="process-evidence">报告准备：{run.reportPreparation.completed} 项有效结果，{run.reportPreparation.charts.length} 项可用图表，补读 {run.reportPreparation.additionalPages||0} 页。{run.reportPreparation.limited>0&&` ${run.reportPreparation.limited} 项结果受限。`}{run.reportPreparation.readNote}</p>}
 </div></details>;
}
