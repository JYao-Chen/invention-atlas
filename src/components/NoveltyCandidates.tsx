'use client';
import {useEffect,useState} from 'react';
export default function NoveltyCandidates({patentIds,memberships,disabled,onSave,onDirty,purpose='novelty',readOnly=false}:{patentIds:string[];memberships:{patent:string;strategies:string[]}[];disabled:boolean;onSave:(ids:string[])=>Promise<void>;onDirty?:(dirty:boolean)=>void;purpose?:'novelty'|'layout';readOnly?:boolean}){
 const [selected,setSelected]=useState(new Set(patentIds)),[filter,setFilter]=useState('');
 const dirty=selected.size!==patentIds.length||patentIds.some(id=>!selected.has(id));
 useEffect(()=>{onDirty?.(dirty||!selected.size);return()=>onDirty?.(false);},[dirty,selected.size,onDirty]);
 const locked=disabled||readOnly,layout=purpose==='layout';
 const rows=memberships.filter(row=>(row.patent+' '+row.strategies.join(' ')).toLowerCase().includes(filter.toLowerCase()));
 return <section className="professional-feature-editor"><h3>{layout?'选择布局抽取文献':'选择对比文献'}</h3><p className="muted">{layout?'保留的专利将在下一阶段抽取措施—效果关系。取消不相关记录后，保存选择再确认；不会改变已确认研究范围。':'按检索命中路径筛选候选。保留的文献将在下一阶段逐件读取原文并对照方案特征。'}</p><label>{layout?'筛选公开编号':'筛选编号或策略'}<input value={filter} onChange={event=>setFilter(event.target.value)} placeholder={layout?'公开编号':'公开编号或策略名称'}/></label>
 <div className="professional-actions"><span aria-live="polite">已选 {selected.size} / {memberships.length} 件</span>{!readOnly&&<><button disabled={locked} onClick={()=>setSelected(new Set(memberships.map(row=>row.patent)))}>选择全部</button><button disabled={locked} onClick={()=>setSelected(new Set())}>清空选择</button></>}</div>
 <div className="professional-candidate-list">{rows.map(row=><label className="professional-alias-option" key={row.patent}><input type="checkbox" disabled={locked} checked={selected.has(row.patent)} onChange={event=>setSelected(value=>{const next=new Set(value);if(event.target.checked)next.add(row.patent);else next.delete(row.patent);return next;})}/><span>{row.patent}{row.strategies.length>0&&<small className="muted"> · {row.strategies.join('、')}</small>}</span></label>)}{!rows.length&&<p className="muted">没有符合筛选条件的候选。</p>}</div>
 {!selected.size&&<p className="muted">{layout?'至少保留一件专利才能抽取关系；没有合适候选时，请调整检索词或研究范围。':'至少保留一件候选才能执行原文对比；没有合适候选时，应修改策略重新检索。'}</p>}{!readOnly&&<><button disabled={locked||!selected.size||!dirty} onClick={()=>void onSave(memberships.filter(row=>selected.has(row.patent)).map(row=>row.patent))}>保存文献选择</button><p role="status" className="muted">{dirty?'文献选择尚未保存':'已显示保存版本'}</p></>}</section>;
}
