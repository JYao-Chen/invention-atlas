'use client';
import {useMemo,useState} from 'react';
import type {AnalysisResult} from '@/lib/types';

// Operate extension: inherit the result panel. A paged cross-tab leads to literal evidence;
// counts deduplicate publications, evidence does not. No new visual world or legal claims.
export default function LayoutMatrixView({result,onPatent}:{result:AnalysisResult;onPatent:(id:string)=>void}){
 const matrix=result.layoutMatrix!,[query,setQuery]=useState(''),[functionPage,setFunctionPage]=useState(0),[effectPage,setEffectPage]=useState(0),[selected,setSelected]=useState<[string,string]|null>(null),[evidencePage,setEvidencePage]=useState(0);
 const cells=useMemo(()=>new Map(matrix.cells.map(cell=>[JSON.stringify([cell.function,cell.effect]),cell])),[matrix]);
 const functions=matrix.functions.filter(fn=>fn.toLowerCase().includes(query.toLowerCase())),effects=matrix.effects;
 const rowPage=Math.min(functionPage,Math.max(0,Math.ceil(functions.length/12)-1)),columnPage=Math.min(effectPage,Math.max(0,Math.ceil(effects.length/8)-1));
 const shownFunctions=functions.slice(rowPage*12,rowPage*12+12),shownEffects=effects.slice(columnPage*8,columnPage*8+8);
 const active=selected?cells.get(JSON.stringify(selected)):undefined;
 const evidence=active?.evidenceRows||[],currentEvidence=Math.min(evidencePage,Math.max(0,Math.ceil(evidence.length/10)-1));
 function choose(fn:string,effect:string){setSelected([fn,effect]);setEvidencePage(0);}
 return <div className="layout-matrix-view">
 <label>查找技术措施<input value={query} onChange={e=>{setQuery(e.target.value);setFunctionPage(0);}} placeholder="输入标签中的文字"/></label>
 <p>单元格为去重公开编号数；点击数字查看原文证据。未观测不表示专利空白。</p>
 {!functions.length||!effects.length?<p className="empty">没有符合条件的技术措施或效果标签。请调整查找条件，或切换数据表查看抽取结果。</p>:<>
 <div className="table-scroll" role="region" aria-label="技术措施与效果矩阵，可横向滚动" tabIndex={0}><table><caption>技术措施 × 效果；共 {matrix.functions.length} 项措施、{effects.length} 项效果，{matrix.cells.length} 个已观测组合</caption><thead><tr><th scope="col">技术措施 / 效果</th>{shownEffects.map(effect=><th scope="col" key={effect}>{effect}</th>)}</tr></thead><tbody>{shownFunctions.map(fn=><tr key={fn}><th scope="row">{fn}</th>{shownEffects.map(effect=>{const cell=cells.get(JSON.stringify([fn,effect]));return <td key={effect}>{cell?<button type="button" aria-pressed={selected?.[0]===fn&&selected?.[1]===effect} aria-label={`${fn}；${effect}：${cell.documents} 条公开件，查看证据`} onClick={()=>choose(fn,effect)}>{cell.documents}</button>:<span className="layout-unobserved">未观测</span>}</td>;})}</tr>)}</tbody></table></div>
 <div className="layout-matrix-pages"><div className="pagination"><button disabled={rowPage===0} onClick={()=>setFunctionPage(rowPage-1)}>上一页措施</button><span>{rowPage*12+1}—{Math.min((rowPage+1)*12,functions.length)} / {functions.length}</span><button disabled={(rowPage+1)*12>=functions.length} onClick={()=>setFunctionPage(rowPage+1)}>下一页措施</button></div><div className="pagination"><button disabled={columnPage===0} onClick={()=>setEffectPage(columnPage-1)}>上一页效果</button><span>{columnPage*8+1}—{Math.min((columnPage+1)*8,effects.length)} / {effects.length}</span><button disabled={(columnPage+1)*8>=effects.length} onClick={()=>setEffectPage(columnPage+1)}>下一页效果</button></div></div>
 </>}
 {active&&<section className="layout-matrix-evidence" aria-label="所选组合原文证据"><h4>{active.function} · {active.effect}</h4><p>{active.documents} 条公开件，{evidence.length} 条证据</p>{evidence.slice(currentEvidence*10,currentEvidence*10+10).map(index=>{const row=result.rows[index];return row?<article key={index}><button className="text-link" onClick={()=>onPatent(String(row.patent))}>{String(row.patent)}</button><blockquote>{String(row.quote||'')}</blockquote>{typeof row.section==='string'&&<small>来源字段：{row.section}</small>}</article>:<p key={index} role="alert">当前快照未包含第 {index+1} 条原文证据，请读取完整结果后查看。</p>;})}{evidence.length>10&&<div className="pagination"><button disabled={currentEvidence===0} onClick={()=>setEvidencePage(currentEvidence-1)}>上一页证据</button><span>{currentEvidence*10+1}—{Math.min((currentEvidence+1)*10,evidence.length)} / {evidence.length}</span><button disabled={(currentEvidence+1)*10>=evidence.length} onClick={()=>setEvidencePage(currentEvidence+1)}>下一页证据</button></div>}</section>}
 </div>;
}
