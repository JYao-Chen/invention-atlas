'use client';
import {useEffect,useState} from 'react';
import ReportBodyEditor from './ReportBodyEditor';
import ReportVersionBasis from './ReportVersionBasis';
import ReportComments from './ReportComments';
import ReportShareManager from './ReportShareManager';
import ReportTasks from './ReportTasks';
import ReportPublications from './ReportPublications';
import ReportDocumentDownloads from './ReportDocumentDownloads';
import {compareReportSections} from '@/lib/report-sections';
import {reportLineDiff} from '@/lib/report-line-diff';
type Version={revision:number;title:string;answer:string;status:string;citation_review?:string};
export default function ReportDraftEditor({reportId,selectedRevision,readOnly,onRead}:{reportId:string;selectedRevision:number;readOnly:boolean;onRead:(version:Version)=>void}){
 const [versions,setVersions]=useState<Version[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [comparisonRevision,setComparisonRevision]=useState(0);
 const [showBasis,setShowBasis]=useState(false);
 async function refresh(){const response=await fetch('/api/reports/'+reportId+'/versions'),data=await response.json();if(!response.ok)throw new Error(data.error||'读取版本失败');const list=[data.original,...data.versions];setVersions(list);return list as Version[];}
 useEffect(()=>{void refresh().catch(e=>setError((e as Error).message));},[reportId]);
 const current=versions.find(v=>v.revision===selectedRevision),latest=versions.at(-1)?.revision||0;
 const comparison=versions.find(v=>v.revision===comparisonRevision),differences=current&&comparison?compareReportSections(comparison.answer,current.answer):[];
 return <details className="report-version-panel"><summary>报告版本与编辑{selectedRevision?' · 草稿第'+selectedRevision+'版':' · 原始报告'}</summary>
  <label>阅读版本<select aria-label="阅读报告版本" disabled={busy} value={selectedRevision} onChange={e=>{const version=versions.find(v=>v.revision===Number(e.target.value));if(version)onRead(version);}}>{versions.map(version=><option key={version.revision} value={version.revision}>{version.revision?'草稿第'+version.revision+'版':'原始报告'} · {version.title}</option>)}</select></label>
  {current?.citation_review==='needs_review'&&<p className="notice">人工编辑草稿：正文已修改，引用与结论需核对。原始工具结果未改变。</p>}
  <div className="record-actions"><a className="button" href={'/api/reports/'+reportId+'/html?version='+selectedRevision}>下载当前版本 HTML</a><a className="button" href={'/api/reports/'+reportId+'/markdown?version='+selectedRevision}>下载当前版本 Markdown</a></div>
  <ReportDocumentDownloads key={'download:'+reportId+':'+selectedRevision} baseUrl={'/api/reports/'+reportId+'?version='+selectedRevision} filename={'patent-report-'+reportId+'-version-'+selectedRevision}/>
  <ReportComments key={'comments:'+reportId+':'+selectedRevision} reportId={reportId} revision={selectedRevision} readOnly={readOnly}/>
  <ReportPublications key={'publication:'+reportId} reportId={reportId} revision={selectedRevision} latest={latest} readOnly={readOnly}/>
  <ReportTasks key={'tasks:'+reportId+':'+selectedRevision} reportId={reportId} revision={selectedRevision} readOnly={readOnly}/>
  {!readOnly&&<ReportShareManager key={'share:'+reportId+':'+selectedRevision} reportId={reportId} revision={selectedRevision}/>}
  <details><summary>已保存版本的正文差异 · {differences.length}处</summary>
   <label>比较基准<select aria-label="版本比较基准" value={comparisonRevision} onChange={e=>setComparisonRevision(Number(e.target.value))}>{versions.map(version=><option key={version.revision} value={version.revision}>{version.revision?'草稿第'+version.revision+'版':'原始报告'}</option>)}</select></label>
   <details onToggle={e=>setShowBasis(e.currentTarget.open)}><summary>研究范围与工具结果依据</summary>{showBasis&&<ReportVersionBasis reportId={reportId} from={comparisonRevision} to={selectedRevision}/>}</details>
   {differences.length===0&&<p className="muted">两个已保存版本的正文相同。未保存的编辑不参与比较。</p>}
   {differences.map(difference=><details key={difference.key}><summary>{difference.status==='added'?'新增':difference.status==='removed'?'删除':'修改'} · {difference.title}</summary><h4>段落差异</h4><div className="report-line-diff">{reportLineDiff(difference.before,difference.after).map((line,index)=><div key={index} data-change={line.kind}><span aria-label={line.kind==='added'?'新增':line.kind==='removed'?'删除':'不变'}>{line.kind==='added'?'+':line.kind==='removed'?'−':' '}</span><pre>{line.text||'\u00a0'}</pre></div>)}</div>{difference.before&&<details><summary>修改前完整正文</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{difference.before}</pre></details>}{difference.after&&<details><summary>修改后完整正文</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{difference.after}</pre></details>}</details>)}
  </details>
{!readOnly&&current&&selectedRevision===latest&&<form key={current.revision} onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);setBusy(true);setError('');void (async()=>{try{const response=await fetch('/api/reports/'+reportId+'/versions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedRevision:current.revision,title:String(data.get('title')).trim(),answer:String(data.get('answer'))})}),saved=await response.json();if(!response.ok)throw new Error(saved.error||'保存草稿失败');const next=await refresh(),version=next.find(v=>v.revision===saved.revision);if(version)onRead(version);}catch(e){setError((e as Error).message);}finally{setBusy(false);}})();}}><label>草稿标题<input name="title" required maxLength={200} defaultValue={current.title} disabled={busy}/></label><ReportBodyEditor answer={current.answer} disabled={busy}/><p className="muted">保存新增版本，不覆盖原报告。图表引用编号需保持与已保存结果对应。</p><button className="primary" disabled={busy}>保存为新草稿版本</button></form>}
  {!readOnly&&current&&selectedRevision!==latest&&<p className="muted">当前为历史版本。请选择最新草稿后编辑，避免覆盖其他修改。</p>}{error&&<p role="alert" className="error">{error}</p>}
 </details>;
}
