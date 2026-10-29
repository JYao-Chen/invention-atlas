'use client';
import {useEffect,useMemo,useState} from 'react';
import Markdown from './MathMarkdown';
import type {AnalysisResult,ConclusionReview,ReportConclusion} from '@/lib/types';

type Decision='accept'|'modify'|'reject';
type Group={dimension:'report'|'section'|'tool';key:string;count:number;accept:number;modify:number;reject:number;acceptRate:number;modifyRate:number;rejectRate:number;averageDurationMs:number};
const decisionNames:Record<Decision,string>={accept:'采纳',modify:'修改',reject:'驳回'};
const percent=(value:number)=>(value*100).toFixed(value===0||value===1?0:1)+'%';
const seconds=(ms:number)=>ms<60000?(ms/1000).toFixed(1)+' 秒':(ms/60000).toFixed(1)+' 分钟';

// Paragraph-level human review of a saved report version: start, decide with reasons, and read the tallies.
export default function ReportReview({reportId,revision,results,readOnly,currentUserId,toolTitle,onPatent}:{reportId:string;revision:number;results:AnalysisResult[];readOnly:boolean;currentUserId?:string;toolTitle:(tool:string)=>string;onPatent:(id:string)=>void}){
 const [conclusions,setConclusions]=useState<ReportConclusion[]>([]),[reviews,setReviews]=useState<ConclusionReview[]>([]),[groups,setGroups]=useState<Group[]>([]);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[filter,setFilter]=useState<'all'|'pending'|'done'>('all');
 const [active,setActive]=useState<{conclusion:string;review:string}>(),[decision,setDecision]=useState<Decision>('accept'),[reason,setReason]=useState(''),[modified,setModified]=useState(''),[evidenceResults,setEvidenceResults]=useState<string[]>([]),[extraPatents,setExtraPatents]=useState('');
 const base='/api/reports/'+reportId;
 async function request(path:string,init?:RequestInit){const response=await fetch(base+path,init),data=await response.json();if(!response.ok)throw new Error(data.error||'复核请求失败');return data;}
 async function refresh(){const [c,r,s]=await Promise.all([request('/conclusions?version='+revision),request('/reviews?version='+revision),request('/review-statistics?version='+revision)]);setConclusions(c.conclusions);setReviews(r.reviews);setGroups(s.groups);}
 useEffect(()=>{setLoading(true);setActive(undefined);setError('');void refresh().catch(e=>setError((e as Error).message)).finally(()=>setLoading(false));},[reportId,revision]);
 // Latest submitted decision per conclusion for the current user, plus any open (unsubmitted) record.
 const mine=useMemo(()=>{const latest=new Map<string,ConclusionReview>(),open=new Map<string,ConclusionReview>();for(const review of reviews){if(review.reviewer_id!==currentUserId)continue;if(!review.submitted_at){open.set(review.conclusion_id,review);continue;}const old=latest.get(review.conclusion_id);if(!old||+new Date(old.submitted_at!)<=+new Date(review.submitted_at))latest.set(review.conclusion_id,review);}return {latest,open};},[reviews,currentUserId]);
 const others=useMemo(()=>{const count=new Map<string,number>();for(const review of reviews)if(review.submitted_at&&review.reviewer_id!==currentUserId)count.set(review.conclusion_id,(count.get(review.conclusion_id)||0)+1);return count;},[reviews,currentUserId]);
 const shown=conclusions.filter(c=>filter==='all'||(filter==='done')===mine.latest.has(c.id));
 const resultTitle=(id:string)=>{const result=results.find(r=>r.id===id);return result?result.title||toolTitle(result.tool):id.slice(0,8);};
 async function begin(conclusion:ReportConclusion){
  setBusy(true);setError('');
  try{
   const review=mine.open.get(conclusion.id)||await request('/reviews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision,conclusionId:conclusion.id})});
   if(!mine.open.has(conclusion.id))setReviews(value=>[...value,review]);
   setActive({conclusion:conclusion.id,review:review.id});setDecision('accept');setReason('');setModified(conclusion.text);setEvidenceResults(conclusion.resultIds);setExtraPatents(conclusion.patentNumbers.join(', '));
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function submit(){
  if(!active)return;setBusy(true);setError('');
  try{
   const patentNumbers=[...new Set(extraPatents.split(/[,，\s]+/).map(v=>v.trim()).filter(Boolean))];
   await request('/reviews/'+active.review,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({decision,reason:reason.trim(),...(decision==='modify'?{modifiedText:modified.trim()}:{}),evidence:{patentNumbers,resultIds:evidenceResults}})});
   setActive(undefined);await refresh();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 const overall=groups.find(g=>g.dimension==='report'),sections=groups.filter(g=>g.dimension==='section'),tools=groups.filter(g=>g.dimension==='tool');
 const titleOf=(key:string)=>conclusions.find(c=>c.section===key)?.sectionTitle||key;
 const table=(rows:Group[],label:(key:string)=>string)=><table className="review-stats-table"><thead><tr><th>分组</th><th>复核条数</th><th>采纳</th><th>修改</th><th>驳回</th><th>平均耗时</th></tr></thead><tbody>{rows.map(row=><tr key={row.dimension+row.key}><td>{label(row.key)}</td><td>{row.count}</td><td>{row.accept} · {percent(row.acceptRate)}</td><td>{row.modify} · {percent(row.modifyRate)}</td><td>{row.reject} · {percent(row.rejectRate)}</td><td>{seconds(row.averageDurationMs)}</td></tr>)}</tbody></table>;
 const canSubmit=!busy&&(decision==='accept'||reason.trim())&&(decision!=='modify'||modified.trim());
 return <section className="report-review" aria-label="逐条复核">
  <header className="report-review-head">
   <div><h3>逐条复核</h3><p className="muted">{revision?'草稿第'+revision+'版':'原始报告'}共 {conclusions.length} 条结论，本人已复核 {mine.latest.size} 条。复核只记录判断，不修改报告正文。</p></div>
   <div className="review-filter" role="group" aria-label="筛选结论">{(['all','pending','done'] as const).map(key=><button key={key} type="button" className={filter===key?'active':''} aria-pressed={filter===key} onClick={()=>setFilter(key)}>{key==='all'?'全部':key==='pending'?'待复核':'已复核'}</button>)}</div>
  </header>
  {error&&<p role="alert" className="error">{error}</p>}
  {overall?<div className="review-summary">
   <dl className="review-totals"><div><dt>已复核条目</dt><dd>{overall.count}</dd></div><div><dt>采纳</dt><dd>{percent(overall.acceptRate)}</dd></div><div><dt>修改</dt><dd>{percent(overall.modifyRate)}</dd></div><div><dt>驳回</dt><dd>{percent(overall.rejectRate)}</dd></div><div><dt>平均耗时</dt><dd>{seconds(overall.averageDurationMs)}</dd></div></dl>
   <details><summary>按章节统计 · {sections.length} 组</summary>{table(sections,titleOf)}</details>
   <details><summary>按工具统计 · {tools.length} 组</summary>{table(tools,key=>key==='unattributed'?'无工具关联':toolTitle(key))}<p className="field-help">一条结论关联多个工具时分别计入各组，各组条数不能相加。每位复核人对同一条只计最后一次提交。</p></details>
  </div>:!loading&&<p className="muted">尚无已提交的复核。统计在第一条提交后出现。</p>}
  {loading&&<p role="status">正在读取结论条目…</p>}
  {!loading&&!conclusions.length&&<p className="muted">这个版本没有可复核的段落。</p>}
  <ol className="review-list">{shown.map(conclusion=>{const done=mine.latest.get(conclusion.id),open=active?.conclusion===conclusion.id,peers=others.get(conclusion.id);return <li key={conclusion.id} className={'review-item'+(open?' is-open':'')} data-decision={done?.decision||undefined}>
   <div className="review-item-meta"><span>{conclusion.sectionTitle}</span>{done&&<span className="review-decision">本人：{decisionNames[done.decision as Decision]}</span>}{peers&&<span className="muted">其他成员已复核 {peers} 次</span>}</div>
   <div className="review-item-text markdown"><Markdown>{conclusion.text.replace(/\[\[chart:[^\]]+\]\]/g,'')}</Markdown></div>
   {(conclusion.patentNumbers.length>0||conclusion.resultIds.length>0)&&<div className="review-evidence">{conclusion.patentNumbers.map(id=><button key={id} type="button" className="evidence-chip" onClick={()=>onPatent(id)}>{id}</button>)}{conclusion.resultIds.map(id=><span key={id} className="evidence-chip is-result">{resultTitle(id)}</span>)}</div>}
   {done&&(done.reason||done.modified_text)&&<div className="review-previous">{done.reason&&<p><strong>理由</strong>{done.reason}</p>}{done.modified_text&&<p><strong>修改为</strong>{done.modified_text}</p>}</div>}
   {!readOnly&&!open&&<div className="record-actions"><button type="button" disabled={busy||Boolean(active)} onClick={()=>void begin(conclusion)}>{mine.open.has(conclusion.id)?'继续复核':done?'重新复核':'开始复核'}</button></div>}
   {open&&<form className="review-form" onSubmit={e=>{e.preventDefault();void submit();}}>
    <fieldset className="review-decisions"><legend>判断</legend>{(['accept','modify','reject'] as Decision[]).map(value=><label key={value}><input type="radio" name={'decision-'+conclusion.id} value={value} checked={decision===value} onChange={()=>setDecision(value)}/>{decisionNames[value]}</label>)}</fieldset>
    <label>理由{decision==='accept'?'（可选）':''}<textarea rows={2} maxLength={10000} required={decision!=='accept'} value={reason} onChange={e=>setReason(e.target.value)} placeholder={decision==='reject'?'说明哪一处缺少依据或与结果不符':decision==='modify'?'说明修改的原因':'可记录核对过的依据'}/></label>
    {decision==='modify'&&<label>修改后的结论<textarea rows={4} required value={modified} onChange={e=>setModified(e.target.value)}/></label>}
    {conclusion.resultIds.length>0&&<fieldset className="review-sources"><legend>核对过的工具结果</legend>{conclusion.resultIds.map(id=><label key={id}><input type="checkbox" checked={evidenceResults.includes(id)} onChange={e=>setEvidenceResults(value=>e.target.checked?[...value,id]:value.filter(v=>v!==id))}/>{resultTitle(id)}</label>)}</fieldset>}
    <label>依据的公开编号<input value={extraPatents} onChange={e=>setExtraPatents(e.target.value)} placeholder="逗号分隔，可补充人工找到的编号"/></label>
    <div className="record-actions"><button type="submit" className="primary" disabled={!canSubmit}>{busy?'正在提交…':'提交'+decisionNames[decision]}</button><button type="button" disabled={busy} onClick={()=>setActive(undefined)}>暂不提交</button></div>
    <p className="field-help">提交后不可覆盖；需要改判时重新复核会新建一条记录。耗时从点击“开始复核”算起，包括中途暂停。</p>
   </form>}
  </li>;})}</ol>
 </section>;
}
