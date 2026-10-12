'use client';
import {useEffect,useState} from 'react';
export type LayoutLabelConfirmation={resultId:string;objective:string;functions:{source:string;label:string;include:boolean}[];effects:{source:string;label:string;include:boolean}[]};
// Operate extension: literal source labels alongside editable research labels;
// saving is distinct from confirmation, with inherited form and focus styles.
export default function LayoutLabelEditor({confirmation,disabled,readOnly=false,onSave,onDirty}:{confirmation:LayoutLabelConfirmation;disabled:boolean;readOnly?:boolean;onSave:(value:LayoutLabelConfirmation)=>Promise<void>;onDirty:(dirty:boolean)=>void}){
 const [value,setValue]=useState(confirmation),[dirty,setDirty]=useState(false);
 useEffect(()=>{onDirty(dirty);return()=>onDirty(false);},[dirty,onDirty]);
 function update(axis:'functions'|'effects',index:number,change:{label?:string;include?:boolean}){setValue(current=>({...current,[axis]:current[axis].map((row,i)=>i===index?{...row,...change}:row)}));setDirty(true);}
 return <form className="layout-label-editor" onSubmit={e=>{e.preventDefault();void onSave(value);}}><h3>确认布局标签</h3><p>研发目标：{confirmation.objective}</p><p className="muted">取消勾选可排除标签；使用相同确认名称可合并标签。原始名称和引文保持不变，合并不代表术语已被证明等价。保存修改后再确认此版本。</p>
 {(['functions','effects'] as const).map(axis=><fieldset key={axis}><legend>{axis==='functions'?'技术措施':'技术效果'} · 保留 {value[axis].filter(r=>r.include).length} / {value[axis].length}</legend><div className="layout-label-list">{value[axis].map((row,index)=><div className="layout-label-row" key={row.source}><label className="layout-label-include"><input type="checkbox" disabled={disabled||readOnly} checked={row.include} onChange={e=>update(axis,index,{include:e.target.checked})}/><span>保留 {row.source}</span></label><label>确认名称<input aria-label={`${axis==='functions'?'技术措施':'技术效果'}确认名称：${row.source}`} required maxLength={500} disabled={disabled||readOnly||!row.include} value={row.label} onChange={e=>update(axis,index,{label:e.target.value})}/></label></div>)}</div></fieldset>)}
 {!readOnly&&<div className="professional-actions"><button disabled={disabled||!dirty||!value.functions.some(r=>r.include)||!value.effects.some(r=>r.include)}>保存标签修改</button><span role="status">{dirty?'修改尚未保存':'已显示保存版本'}</span></div>}
 </form>;
}
