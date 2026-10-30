'use client';
import type {PatentEvidenceLocation} from '../lib/patent-evidence';
import type {Row} from '../lib/types';
const kinds=[['problem','技术问题'],['means','解决手段'],['effect','技术效果']] as const;
export default function PatentReadingNotes({rows,onPatent}:{rows:Row[];onPatent:(id:string,location?:PatentEvidenceLocation)=>void}){
 return <div className="patent-reading-notes">{kinds.map(([kind,title])=>{const notes=rows.filter(row=>row.kind===kind);return <details key={kind} open={notes.length>0}><summary>{title} · {notes.length}项</summary>{!notes.length&&<p className="muted">本次未提取到明确原文依据。</p>}{notes.map((note,index)=><article key={index}><p>{String(note.interpretation)}</p><small>模型辅助整理 · {String(note.patent)} · {note.section==='abstract'?'摘要':note.section==='claim'?'权利要求 '+note.claimNumber:'说明书'} · 字符 {String(note.start)}—{String(note.end)}</small><blockquote style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{String(note.quote)}</blockquote>{kind==='effect'&&<p className="muted">专利原文声明的效果。</p>}<button onClick={()=>onPatent(String(note.patent),{section:String(note.section),quote:String(note.quote),start:Number(note.section==='claim'?note.source_claim_offset:note.start),claim:note.source_claim===undefined?undefined:Number(note.source_claim)})}>查看专利原文</button></article>)}</details>;})}</div>;
}
