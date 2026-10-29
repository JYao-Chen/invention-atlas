'use client';
import {useEffect,useState} from 'react';

type Experiment={id:string;dataset_id:string;method:'ai'|'manual_boolean';query:string;started_at:string;ended_at:string;duration_ms:number;patent_numbers:string[]};
type Comparison={returned:number;reference:number;truePositives:number;precision:number|null;recall:number|null;durationMs:number;limitation:string};
const methodNames={ai:'AI 检索',manual_boolean:'人工布尔检索'};
const split=(text:string)=>[...new Set(text.split(/[,，;；\s]+/).map(v=>v.trim()).filter(Boolean))];
const ratio=(value:number|null)=>value===null?'—':(value*100).toFixed(1)+'%';
const duration=(ms:number)=>ms<60000?(ms/1000).toFixed(1)+' 秒':Math.floor(ms/60000)+' 分 '+Math.round(ms%60000/1000)+' 秒';

// Timed record of one AI or manual Boolean search, compared against a reference set the researcher supplies.
export default function RetrievalExperiments({datasetId,datasetName,readOnly,latestSearch}:{datasetId?:string;datasetName?:string;readOnly:boolean;latestSearch?:{query:string;patentNumbers:string[];boolean:boolean}}){
 const [records,setRecords]=useState<Experiment[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [method,setMethod]=useState<'ai'|'manual_boolean'>('manual_boolean'),[query,setQuery]=useState(''),[hits,setHits]=useState(''),[startedAt,setStartedAt]=useState<string>(),[endedAt,setEndedAt]=useState<string>(),[now,setNow]=useState(Date.now());
 const [comparing,setComparing]=useState<string>(),[reference,setReference]=useState(''),[comparison,setComparison]=useState<Record<string,Comparison>>({});
 async function request(path:string,body?:unknown){const response=await fetch('/api/retrieval-experiments'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:undefined),data=await response.json();if(!response.ok)throw new Error(data.error||'检索实验请求失败');return data;}
 async function refresh(){setRecords((await request('')).records);}
 useEffect(()=>{void refresh().catch(e=>setError((e as Error).message));},[]);
 useEffect(()=>{if(!startedAt||endedAt)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[startedAt,endedAt]);
 async function save(){
  if(!datasetId||!startedAt||!endedAt)return;setBusy(true);setError('');
  try{await request('',{datasetId,method,query:query.trim(),startedAt,endedAt,patentNumbers:split(hits)});setQuery('');setHits('');setStartedAt(undefined);setEndedAt(undefined);await refresh();}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function compare(id:string){
  setBusy(true);setError('');
  try{const result=await request('/'+id+'/compare',{referencePatentNumbers:split(reference)});setComparison(value=>({...value,[id]:result}));}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 const elapsed=startedAt?(endedAt?Date.parse(endedAt):now)-Date.parse(startedAt):0;
 return <section className="retrieval-experiments" aria-labelledby="retrieval-experiments-title">
  <div className="list-heading"><h2 id="retrieval-experiments-title">检索效率实验</h2></div>
  <p className="muted">记录一次检索的方法、查询式、用时和命中编号，再与参考集对照查准率和查全率。系统不代为检索；参考集只用于本次计算，不保存。</p>
  {!readOnly&&<form className="experiment-form" onSubmit={e=>{e.preventDefault();void save();}}>
   <div className="experiment-row">
    <label>方法<select value={method} onChange={e=>setMethod(e.target.value as typeof method)}><option value="manual_boolean">人工布尔检索</option><option value="ai">AI 检索</option></select></label>
    <label>数据集<input value={datasetName||'未选择数据集'} readOnly/></label>
   </div>
   <label>查询式<textarea rows={2} required maxLength={20000} value={query} onChange={e=>setQuery(e.target.value)} placeholder="例如 (sensor OR detector) AND authentication"/></label>
   <label>命中公开编号<textarea rows={3} value={hits} onChange={e=>setHits(e.target.value)} placeholder="逗号、空格或换行分隔"/><span className="field-help">已识别 {split(hits).length} 个编号{latestSearch&&<> · <button type="button" className="link-button" onClick={()=>{setQuery(latestSearch.query);setHits(latestSearch.patentNumbers.join('\n'));setMethod(latestSearch.boolean?'manual_boolean':'ai');}}>填入工作台最近一次专利检索结果</button></>}</span></label>
   <div className="experiment-timer"><span aria-live="polite">{startedAt?'用时 '+duration(Math.max(0,elapsed)):'尚未计时'}</span>
    {!startedAt&&<button type="button" onClick={()=>{setStartedAt(new Date().toISOString());setEndedAt(undefined);setNow(Date.now());}}>开始计时</button>}
    {startedAt&&!endedAt&&<button type="button" onClick={()=>setEndedAt(new Date().toISOString())}>结束计时</button>}
    {startedAt&&<button type="button" onClick={()=>{setStartedAt(undefined);setEndedAt(undefined);}}>重新计时</button>}
    <button type="submit" className="primary" disabled={busy||!datasetId||!endedAt||!query.trim()}>{busy?'正在保存…':'保存实验记录'}</button>
   </div>
  </form>}
  {error&&<p role="alert" className="error">{error}</p>}
  {records.length>0?<div className="history-list">{records.map(record=><article key={record.id} className="experiment-record">
   <div className="experiment-record-head"><strong>{methodNames[record.method]}</strong><span className="muted">{new Date(record.started_at).toLocaleString('zh-CN')} · 用时 {duration(record.duration_ms)} · 命中 {record.patent_numbers.length} 件</span></div>
   <code className="experiment-query">{record.query}</code>
   {comparison[record.id]&&<dl className="experiment-metrics"><div><dt>查准率</dt><dd>{ratio(comparison[record.id].precision)}</dd></div><div><dt>查全率</dt><dd>{ratio(comparison[record.id].recall)}</dd></div><div><dt>命中 / 参考 / 交集</dt><dd>{comparison[record.id].returned} / {comparison[record.id].reference} / {comparison[record.id].truePositives}</dd></div><p className="field-help">{comparison[record.id].limitation}</p></dl>}
   {comparing===record.id?<div className="experiment-compare"><label>参考集公开编号<textarea rows={3} value={reference} onChange={e=>setReference(e.target.value)} placeholder="人工判定的相关专利，逗号或换行分隔"/></label><div className="record-actions"><button type="button" className="primary" disabled={busy||!split(reference).length} onClick={()=>void compare(record.id)}>计算查准率与查全率</button><button type="button" onClick={()=>setComparing(undefined)}>收起</button></div></div>
   :<div className="record-actions"><button type="button" onClick={()=>{setComparing(record.id);setReference('');}}>对照参考集</button></div>}
  </article>)}</div>:<p className="muted">本项目还没有检索实验记录。</p>}
 </section>;
}
