'use client';
import {useEffect,useState} from 'react';
import type {Dataset,ResearchScope,Params} from '@/lib/types';
type Basis={sourceRunId:string;createdAt:string;datasetId:string;datasetSnapshot:Dataset|null;scope:ResearchScope|null;results:{id:string;tool:string;title:string;status:string;createdAt:string;params:Params;scope:{inputCount:number;analyzedCount:number;counting:string}|null;rows:number}[]};
type Comparison={from:number;to:number;basis:{before:Basis;after:Basis;sharedSnapshot:boolean;note:string}};
const parameterNames:Record<string,string>={index_version:'索引版本',query:'检索表达',top_k:'返回数量',year_start:'起始年份',year_end:'截止年份',applicant:'申请人',ipc:'IPC分类',patent_numbers:'公开编号',claim_numbers:'权利要求编号',k:'主题数量',dimension:'分析维度',strategies:'检索策略',strategy_id:'策略编号',frequency:'时间粒度',counting:'计数口径'};
export default function ReportVersionBasis({reportId,from,to}:{reportId:string;from:number;to:number}){
 const [comparison,setComparison]=useState<Comparison>(),[error,setError]=useState('');
 useEffect(()=>{const controller=new AbortController();setComparison(undefined);setError('');void (async()=>{
  try{const response=await fetch('/api/reports/'+reportId+'/compare?from='+from+'&to='+to,{signal:controller.signal}),data=await response.json();if(!response.ok)throw new Error(data.error||'读取分析依据失败');if(!controller.signal.aborted)setComparison(data);}
  catch(e){if(!controller.signal.aborted)setError((e as Error).message);}
 })();return()=>controller.abort();},[reportId,from,to]);
 if(error)return <p role="alert" className="error">{error}</p>;
 if(!comparison)return <p role="status" className="muted">正在读取已保存的分析依据…</p>;
 const basis=comparison.basis.after;
 return <div className="report-version-basis">
  <p>{comparison.basis.note}</p>
  <dl><dt>原始分析</dt><dd>{basis.sourceRunId}</dd><dt>分析时间</dt><dd>{new Date(basis.createdAt).toLocaleString()}</dd><dt>数据集</dt><dd>{basis.datasetSnapshot?.name||basis.datasetId}</dd><dt>数据集快照</dt><dd>{basis.datasetSnapshot?basis.datasetSnapshot.count+'条；公开年份 '+basis.datasetSnapshot.years.join('、'):'原报告未保存数据集概况'}</dd><dt>研究范围</dt><dd>{basis.scope?basis.scope.patentIds.length+'条；'+(basis.scope.counting==='family'?'同族计数':'公开件计数'):'原报告未保存统一研究范围；请查看各工具的实际输入'}</dd>{basis.scope?.query&&<><dt>检索表达</dt><dd>{basis.scope.query}</dd></>}</dl>
  <h4>工具结果快照 · {basis.results.length}项</h4>
  {basis.results.map(result=><details key={result.id}><summary>{result.title} · {result.status==='completed'?'已完成':result.status==='failed'?'失败':'不可用'} · {result.rows}行结果</summary>
   <dl><dt>结果编号</dt><dd>{result.id}</dd><dt>生成时间</dt><dd>{new Date(result.createdAt).toLocaleString()}</dd><dt>实际输入</dt><dd>{result.scope?result.scope.inputCount+'条；分析 '+result.scope.analyzedCount+'条；'+(result.scope.counting==='family'?'同族计数':'公开件计数'):'未记录输入统计'}</dd>
    {Object.entries(result.params).map(([name,value])=><div key={name}><dt>{parameterNames[name]||name}</dt><dd>{Array.isArray(value)?value.map(item=>typeof item==='object'?Object.values(item).join('：'):String(item)).join('、'):String(value)}</dd></div>)}
   </dl>
  </details>)}
 </div>;
}
