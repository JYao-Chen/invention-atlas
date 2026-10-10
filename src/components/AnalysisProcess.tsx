'use client';
import {useEffect,useState} from 'react';
import type {Run} from '../lib/types';
import ResearchTrail from './ResearchTrail';
export default function AnalysisProcess({run,onPatent,tools=[]}:{run:Run;onPatent:(id:string,datasetId:string)=>void;tools?:{name:string;title:string}[]}){
 const [open,setOpen]=useState(run.status==='running'&&!run.answer);
 useEffect(()=>{setOpen(run.status==='running'&&!run.answer);},[Boolean(run.answer),run.status]);
 const completed=run.results.filter(r=>r.status==='completed').length;
 const label=run.status!=='running'?'分析过程':run.answer?'正在撰写报告':run.progress?.tool==='request'?'正在提交问题':run.reportPreparation?'正在整理报告证据':run.plan.length?'正在计算分析指标':'正在确定研究范围';
 return <details className="analysis-process" open={open} onToggle={e=>setOpen(e.currentTarget.open)}><summary>{label}{run.plan.length>0&&<span>{completed}/{run.plan.length} 项完成</span>}</summary><div className="analysis-process-body">
 <ol>{run.plan.map((step,i)=>{const result=run.results.find(r=>r.tool===step.tool&&JSON.stringify(r.params)===JSON.stringify(step.params));return <li key={i}><strong>{result?.title||tools.find(t=>t.name===step.tool)?.title||step.tool}</strong><span>{result?.status==='completed'?'已完成':result?.status==='failed'?'失败':result?.status==='unavailable'?'数据不足':run.status==='running'&&run.progress?.tool===step.tool?'执行中':run.status==='running'?'待执行':'未完成'}</span>{result&&<p>{result.summary}</p>}</li>;})}</ol>
 {run.status==='running'&&!run.plan.length&&run.progress?.tool!=='request'&&<p>正在根据问题确定研究范围、统计口径和所需工具。执行计划返回后将在这里逐项展示。</p>}
 {run.progress&&run.status==='running'&&!run.answer&&<p role="status">{run.progress.unit}{run.progress.total!==undefined&&` · ${run.progress.done||0}/${run.progress.total}`}</p>}
 <ResearchTrail run={run} onPatent={onPatent}/>
 {run.reportPreparation&&<p>报告准备：{run.reportPreparation.completed} 项有效结果，{run.reportPreparation.charts.length} 项可用图表，补读 {run.reportPreparation.additionalPages||0} 页。{run.reportPreparation.limited>0&&` ${run.reportPreparation.limited} 项结果受限。`}{run.reportPreparation.readNote}</p>}
 </div></details>;
}
