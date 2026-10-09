'use client';
import {useState} from 'react';
import type {Row} from '@/lib/types';
export default function ClaimComparison({rows,onPatent}:{rows:Row[];onPatent?:(id:string)=>void}){const [page,setPage]=useState(1),[relation,setRelation]=useState('all');const filtered=rows.filter(row=>relation==='all'||row.relation===relation),current=Math.min(page,Math.max(1,Math.ceil(filtered.length/8)));const labels:Record<string,string>={supported:'所述约束均有对应证据',partial:'部分重合',not_found:'指定权利要求中未发现'};
 return <div className="claim-comparison">
<label>对照结果<select value={relation} onChange={e=>{setRelation(e.target.value);setPage(1);}}>
<option value="all">全部</option>{Object.entries(labels).map(([key,title])=>
<option key={key} value={key}>{title}</option>)}</select>
</label>{filtered.slice((current-1)*8,current*8).map((r,i)=>
<article key={i} data-relation={r.relation as string}>
<header>
<strong>{String(r.element)}</strong>
<span>{labels[String(r.relation)]}</span>
</header>
<div className="claim-pair">
<section>
<button className="text-link" onClick={()=>onPatent?.(String(r.patent))}>{String(r.patent)} · 权利要求 {String(r.claim)}</button>
<blockquote>{String(r.quote)}</blockquote>
<small>权利要求内位置 {String(r.claim_offset)}</small>
</section>
<section>
<button className="text-link" onClick={()=>onPatent?.(String(r.target_patent))}>{String(r.target_patent)}{r.target_claim?' · 权利要求 '+r.target_claim:''}</button>{r.target_quote?<blockquote>{String(r.target_quote)}</blockquote>:<p>所选权利要求中未找到对应证据</p>}<small>{String(r.date_relation)}</small>
</section>
</div>
<p>{String(r.reason)}</p>
</article>)}{!filtered.length&&<p>此类结果为空。</p>}{filtered.length>8&&<div className="pagination">
<button disabled={current===1} onClick={()=>setPage(current-1)}>上一页</button>
<span>{current} / {Math.ceil(filtered.length/8)}</span>
<button disabled={current*8>=filtered.length} onClick={()=>setPage(current+1)}>下一页</button>
</div>}</div>;
}
