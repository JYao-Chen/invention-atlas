'use client';
import {useState} from 'react';
import type {Run} from '@/lib/types';
type Mark={resultId:string;row:number;correct:boolean;note:string};
type Outcome={automatic:{sourceQuoteCount:number;locatableQuotes:number;unresolvedChartReferences:string[];failedTools:string[];unexecutedTools:string[]};human:{precision:number|null;recallWithinJudgedPool:number|null;extractionAccuracy:number|null}};
const ids=(text:string)=>text.split(/[\s,，]+/).filter(Boolean),percent=(v:number|null)=>v===null?'待评审':(v*100).toFixed(1)+'%';
export default function RunReview({run,onPatent}:{run:Run;onPatent?:(id:string,datasetId:string)=>void}){
 const [reviewer,setReviewer]=useState(''),[basis,setBasis]=useState(''),[relevant,setRelevant]=useState(''),[irrelevant,setIrrelevant]=useState(''),[report,setReport]=useState('not_reviewed'),[note,setNote]=useState(''),[marks,setMarks]=useState<Mark[]>([]),[outcome,setOutcome]=useState<Outcome>(),[message,setMessage]=useState(''),[page,setPage]=useState(1);
 if(run.status==='running')return null;const rows=run.results.flatMap(r=>r.rows.map((row,index)=>({resultId:r.id,title:r.title,index,row}))).filter(r=>typeof r.row.quote==='string'),current=Math.min(page,Math.max(1,Math.ceil(rows.length/8)));
 async function load(){try{const response=await fetch('/api/evaluations/'+run.id);const data=await response.json();if(!response.ok)throw new Error(data.error);setOutcome(data.outcome);if(data.judgment){const j=data.judgment;setReviewer(j.reviewer);setBasis(j.basis);setRelevant(j.relevant.join('\n'));setIrrelevant(j.irrelevant.join('\n'));setReport(j.report);setNote(j.reportNote);setMarks(j.extraction);}}catch(e){setMessage((e as Error).message);}}
 return <details className="research-trail" onToggle={e=>{if(e.currentTarget.open&&!outcome)void load();}}>
<summary>质量复核 · 人工标注与程序检查</summary>
<p>引文能定位，不等于解释正确。未标注记录不计作错误；请独立阅读原文后评审。</p>{outcome&&<dl className="review-metrics">
<dt>可定位引文</dt>
<dd>{outcome.automatic.locatableQuotes}/{outcome.automatic.sourceQuoteCount}</dd>
<dt>无法解析的图表引用</dt>
<dd>{outcome.automatic.unresolvedChartReferences.length}</dd>
<dt>失败或数据不足的工具</dt>
<dd>{outcome.automatic.failedTools.length}</dd>
<dt>未执行的计划工具</dt>
<dd>{outcome.automatic.unexecutedTools.length}</dd>
<dt>已标注返回集准确率</dt>
<dd>{percent(outcome.human.precision)}</dd>
<dt>标注相关池内召回率</dt>
<dd>{percent(outcome.human.recallWithinJudgedPool)}</dd>
<dt>人工抽取准确率</dt>
<dd>{percent(outcome.human.extractionAccuracy)}</dd>
</dl>}<form onSubmit={async e=>{e.preventDefault();try{const response=await fetch('/api/evaluations/'+run.id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reviewer,basis,relevant:ids(relevant),irrelevant:ids(irrelevant),extraction:marks,report,reportNote:note})});const data=await response.json();if(!response.ok)throw new Error(data.error);setOutcome(data.outcome);setMessage('复核记录已保存');}catch(e){setMessage((e as Error).message);}}}>
<label>评审人<input required value={reviewer} onChange={e=>setReviewer(e.target.value)}/>
</label>
<label>评审依据与范围<textarea required rows={2} value={basis} onChange={e=>setBasis(e.target.value)} placeholder="阅读了哪些原文、判断相关性的标准是什么"/>
</label>
<details>
<summary>检索相关性标注</summary>
<p>编号用逗号或换行分隔。召回率只针对此处标注的相关记录池，不是全球查全率。</p>
<label>相关的公开编号<textarea rows={2} value={relevant} onChange={e=>setRelevant(e.target.value)}/>
</label>
<label>不相关的公开编号<textarea rows={2} value={irrelevant} onChange={e=>setIrrelevant(e.target.value)}/>
</label>
</details>{rows.length>0&&<details>
<summary>逐项核验抽取 · {marks.length}/{rows.length} 已评审</summary>{rows.slice((current-1)*8,current*8).map(r=>{const mark=marks.find(m=>m.resultId===r.resultId&&m.row===r.index);return <section className="review-row" key={r.resultId+':'+r.index}>
<strong>{r.title} · 第{r.index+1}行</strong>
{Boolean(r.row.patent)&&<button type="button" className="text-link" onClick={()=>onPatent?.(String(r.row.patent),run.datasetId)}>{String(r.row.patent)}</button>}<p>{String(r.row.element||r.row.effect||'')}</p>
<blockquote>{String(r.row.quote)}</blockquote>
{Boolean(r.row.target_quote)&&<blockquote>{String(r.row.target_quote)}</blockquote>}<label>抽取或对应关系<select value={mark?String(mark.correct):'pending'} onChange={e=>{const other=marks.filter(m=>m.resultId!==r.resultId||m.row!==r.index);setMarks(e.target.value==='pending'?other:[...other,{resultId:r.resultId,row:r.index,correct:e.target.value==='true',note:mark?.note||''}]);}}>
<option value="pending">未评审</option>
<option value="true">符合原文</option>
<option value="false">需要修正</option>
</select>
</label>{mark&&<label>复核备注<input value={mark.note} onChange={e=>setMarks(marks.map(m=>m===mark?{...m,note:e.target.value}:m))}/>
</label>}</section>;})}{rows.length>8&&<div className="pagination">
<button type="button" disabled={current===1} onClick={()=>setPage(current-1)}>上一页</button>
<span>{current}/{Math.ceil(rows.length/8)}</span>
<button type="button" disabled={current*8>=rows.length} onClick={()=>setPage(current+1)}>下一页</button>
</div>}</details>}<label>报告结论<select value={report} onChange={e=>setReport(e.target.value)}>
<option value="not_reviewed">未评审</option>
<option value="accepted">可接受</option>
<option value="needs_revision">需要修改</option>
</select>
</label>
<label>报告复核备注<textarea rows={2} value={note} onChange={e=>setNote(e.target.value)}/>
</label>
<button>保存复核记录</button>
</form>{message&&<p role="status">{message}</p>}</details>;
}
