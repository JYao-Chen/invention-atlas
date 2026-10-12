'use client';
import {useEffect,useState} from 'react';
export type LayoutDirectionReview={
 objective:string;directions:{title:string;function:string;effect:string;hypothesis:string;reason:string;query:string;relationStatus:string;observedPublications:number;limitation:string;evidence:{row:number;patent:string;quote:string}[]}[];unresolved:string[];
};
export type LayoutDirectionSearch={query:string;tool:string;status:string;returned:number;summary:string};
const statusNames:Record<string,string>={completed:'已完成',unavailable:'不可用',failed:'执行失败'};
const directionKey=(direction:LayoutDirectionReview['directions'][number])=>JSON.stringify([direction.function,direction.effect,direction.query]);
export default function LayoutDirections({suggestions,searches,availableSuggestions=suggestions,readOnly=true,disabled=false,onDirty,onSave}:{suggestions:LayoutDirectionReview;searches:LayoutDirectionSearch[];availableSuggestions?:LayoutDirectionReview;readOnly?:boolean;disabled?:boolean;onDirty?:(dirty:boolean)=>void;onSave?:(suggestions:LayoutDirectionReview)=>Promise<void>}){
 const [selected,setSelected]=useState(new Set(suggestions.directions.map(directionKey)));
 const dirty=selected.size!==suggestions.directions.length||suggestions.directions.some(direction=>!selected.has(directionKey(direction)));
 useEffect(()=>{onDirty?.(dirty);return()=>onDirty?.(false);},[dirty,onDirty]);
 return <section className="layout-directions"><h3>候选方向与补检索</h3><p>研发目标：{suggestions.objective}</p>
 {!availableSuggestions.directions.length&&<p>没有形成有证据支持的候选方向。请查看下方未解决问题，或重新编辑标签与候选范围。</p>}
 {!selected.size&&availableSuggestions.directions.length>0&&<p>尚未选择纳入报告的方向。保存并确认后，报告只分析已确认矩阵与现有证据，不补造方向。</p>}
 {availableSuggestions.directions.map((direction,index)=><article key={index}><h4>{direction.title}</h4>{!readOnly&&<label className="layout-direction-select"><input type="checkbox" disabled={disabled} checked={selected.has(directionKey(direction))} onChange={event=>setSelected(current=>{const next=new Set(current);if(event.target.checked)next.add(directionKey(direction));else next.delete(directionKey(direction));return next;})}/>纳入报告：{direction.title}</label>}<dl><dt>技术措施</dt><dd>{direction.function}</dd><dt>目标效果</dt><dd>{direction.effect}</dd><dt>关系依据</dt><dd>{direction.relationStatus==='observed_in_selected_evidence'?`确认样本中已观测，涉及 ${direction.observedPublications} 件公开记录`:'待验证组合假设：证据分别支持措施与效果，并未证明组合关系'}</dd></dl><p>{direction.hypothesis}</p><p>{direction.reason}</p><p className="muted">{direction.limitation}</p>
 <details><summary>原文依据 · {direction.evidence.length} 段</summary>{direction.evidence.map(reference=><div className="layout-direction-evidence" key={reference.row}><p>{reference.patent} · 原始证据行 {reference.row+1}</p><blockquote>{reference.quote}</blockquote></div>)}</details>
 <details><summary>补检索式与执行结果</summary><code>{direction.query}</code><div className="table-scroll"><table><caption>在确认研究范围内执行；返回数量不等于全部相关专利数量</caption><thead><tr><th scope="col">检索方式</th><th scope="col">状态</th><th scope="col">返回项</th><th scope="col">说明</th></tr></thead><tbody>{searches.filter(search=>search.query===direction.query).map(search=><tr key={search.tool}><td>{search.tool==='search_patent_passages'?'原文段落检索':'专利记录检索'}</td><td>{statusNames[search.status]||search.status}</td><td>{search.status==='completed'?search.returned:'—'}</td><td>{search.summary}</td></tr>)}</tbody></table></div></details>
 </article>)}
 {suggestions.unresolved.length>0&&<><h4>未解决问题</h4><ul>{suggestions.unresolved.map((issue,index)=><li key={index}>{issue}</li>)}</ul></>}
 {!readOnly&&onSave&&<div className="professional-actions"><span role="status">纳入 {selected.size} / {availableSuggestions.directions.length} 个方向{dirty?' · 选择尚未保存':''}</span><button disabled={disabled||!dirty} onClick={()=>void onSave({...suggestions,directions:availableSuggestions.directions.filter(direction=>selected.has(directionKey(direction)))})}>保存方向选择</button></div>}
 </section>;
}
