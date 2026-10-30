'use client';
import {useMemo,useRef,useState} from 'react';
import type {Claim} from '@/lib/types';
import {claimStructure} from '@/lib/claim-structure';
const labels:Record<string,string>={independent:'独立项',dependent:'从属项',cancelled:'已取消',unresolved:'待确认'};
export default function ClaimReader({claims,onAnalyze,analysisDisabled=false,analysisNote}:{claims:Claim[];onAnalyze?:(number:number)=>void;analysisDisabled?:boolean;analysisNote?:string}){
 const structure=useMemo(()=>claimStructure(claims),[claims]),[selected,setSelected]=useState(0),sections=useRef<Map<number,HTMLElement>>(new Map());
 function jump(index:number){setSelected(index);requestAnimationFrame(()=>{const section=sections.current.get(index);section?.scrollIntoView({block:'nearest'});section?.querySelector<HTMLElement>('summary')?.focus();});}
 return <section className="claim-reader" aria-label="权利要求阅读">
  <h3>权利要求原文 · {structure.nodes.length} 项</h3>
  <p className="muted">按原文引用编号识别独立项和从属项。点击编号阅读对应条款。</p>
  {!structure.nodes.length&&<p>当前来源未提供权利要求。</p>}
  <nav className="claim-index" aria-label="权利要求目录">{structure.nodes.map((node,index)=><button key={index} type="button" aria-label={'阅读权利要求 '+node.number} aria-pressed={selected===index} onClick={()=>jump(index)}>{node.number}<span>{labels[node.status]}</span></button>)}</nav>
  {structure.nodes.map((node,index)=><details key={index} ref={element=>{if(element)sections.current.set(index,element);else sections.current.delete(index);}} open={selected===index} className="claim-section">
   <summary onClick={event=>{event.preventDefault();setSelected(selected===index?-1:index);}}>权利要求 {node.number} · {labels[node.status]}</summary>
   {node.dependsOn.length>0&&<div className="claim-parents"><span>引用：</span>{node.dependsOn.map(number=>{const target=structure.nodes.findIndex(item=>item.number===number),valid=target>=0&&number<node.number&&structure.nodes.filter(item=>item.number===number).length===1;return <button key={number} type="button" disabled={!valid} onClick={()=>jump(target)} aria-label={'跳转到权利要求 '+number}>权利要求 {number}{!valid?'（待确认）':''}</button>;})}</div>}
   {node.issues.length>0&&<ul className="claim-issues">{node.issues.map((issue,i)=><li key={i}>{issue}</li>)}</ul>}
   <p className="claim-original">{node.text}</p>
   {onAnalyze&&node.status!=='cancelled'&&<div className="record-actions"><button type="button" disabled={analysisDisabled||node.issues.some(issue=>issue==='权利要求编号重复')} onClick={()=>onAnalyze(node.number)}>提取本项技术要素</button>{analysisNote&&<span className="muted">{analysisNote}</span>}</div>}
   {node.sourceStart!==undefined&&<small className="muted">来源文本位置 {node.sourceStart}—{node.sourceEnd}</small>}
  </details>)}
 </section>;
}
