'use client';
import {useEffect,useRef,useState} from 'react';
import type {Patent} from '@/lib/types';
type Draft={id:string;title:string;abstract:string;applicants:string;publicationDate:string;ipc:string;description:string;claims:{number:number;text:string}[];sourceUrl:string};
const empty:Draft={id:'',title:'',abstract:'',applicants:'',publicationDate:'',ipc:'',description:'',claims:[],sourceUrl:''};
export default function DataRecords({datasetId,records,onPatent,onChanged}:{datasetId:string;records:Patent[];onPatent:(id:string)=>void;onChanged:()=>Promise<void>}){
 const [selected,setSelected]=useState<string[]>([]),[draft,setDraft]=useState<Draft>(),[editing,setEditing]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{setSelected([]);setDraft(undefined);setError('');},[datasetId]);useEffect(()=>{if(draft)dialog.current?.showModal();},[draft!==undefined]);
 async function request(path:string,method:string,body?:unknown){const r=await fetch('/api/'+path+'?dataset='+datasetId,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw Error(d.error);return d;}
 async function edit(id:string){try{const p:Patent=await request('patents/'+id,'GET');setEditing(id);setDraft({id:p.id,title:p.title,abstract:p.abstract,applicants:p.applicants.join('; '),publicationDate:p.publicationDate,ipc:p.ipc.join('; '),description:p.description,claims:p.claims.map(c=>({number:c.number,text:c.text})),sourceUrl:p.sourceUrl});setError('');}catch(e){setError((e as Error).message);}}
 async function remove(ids:string[]){if(!confirm(`删除选中的 ${ids.length} 条专利记录？已保存报告和对话结果保留，原文详情将不再从当前数据集读取。`))return;setBusy(true);try{await request('patents','DELETE',{ids});setSelected([]);await onChanged();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <>
<div className="record-actions">
<button onClick={()=>{setEditing('');setDraft({...empty});setError('');}}>新增专利</button>
<button disabled={!selected.length||busy} onClick={()=>void remove(selected)}>删除选中（{selected.length}）</button>
<small>勾选记录，可跨页批量删除。</small>
</div>{error&&!draft&&<p className="error">{error}</p>}
 <div className="table-scroll">
<table>
<thead>
<tr>
<th>
<input type="checkbox" aria-label="选择本页记录" checked={records.length>0&&records.every(p=>selected.includes(p.id))} onChange={e=>setSelected(e.target.checked?[...new Set([...selected,...records.map(p=>p.id)])]:selected.filter(id=>!records.some(p=>p.id===id)))}/>
</th>
<th>公开编号与标题</th>
<th>申请人</th>
<th>公开日期</th>
<th>IPC</th>
<th>操作</th>
</tr>
</thead>
<tbody>{records.map(p=>
<tr key={p.id}>
<td>
<input type="checkbox" aria-label={'选择 '+p.id} checked={selected.includes(p.id)} onChange={e=>setSelected(e.target.checked?[...selected,p.id]:selected.filter(id=>id!==p.id))}/>
</td>
<td>
<button className="patent-title" onClick={()=>onPatent(p.id)}>
<span>{p.id}</span>
<strong>{p.title}</strong>
</button>
</td>
<td>{p.applicants.join('; ')||'未提供'}</td>
<td className="nowrap">{p.publicationDate}</td>
<td>{p.ipc.slice(0,2).join('; ')||'未提供'}</td>
<td>
<div className="record-row-actions">
<button onClick={()=>void edit(p.id)}>编辑</button>
<button disabled={busy} onClick={()=>void remove([p.id])}>删除</button>
</div>
</td>
</tr>)}</tbody>
</table>{!records.length&&<p className="empty">没有匹配的记录。</p>}</div>
 {draft&&<dialog ref={dialog} className="record-editor" onCancel={()=>setDraft(undefined)}>
<form onSubmit={async e=>{e.preventDefault();setBusy(true);try{await request('patents'+(editing?'/'+editing:''),editing?'PATCH':'POST',{...draft,applicants:draft.applicants.split(/[;；\n]/).map(v=>v.trim()).filter(Boolean),ipc:draft.ipc.split(/[;；,，\n]/).map(v=>v.trim()).filter(Boolean),...(draft.sourceUrl?{}:{sourceUrl:undefined})});setDraft(undefined);await onChanged();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
<h2>{editing?'编辑专利':'新增专利'}</h2>
<div className="scope-fields">
<label>公开编号<input required disabled={Boolean(editing)} value={draft.id} onChange={e=>setDraft({...draft,id:e.target.value})}/>
</label>
<label>公开日期<input type="date" value={draft.publicationDate} onChange={e=>setDraft({...draft,publicationDate:e.target.value})}/>
</label>
</div>
<label>标题<input required value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/>
</label>
<label>申请人（分号分隔）<input value={draft.applicants} onChange={e=>setDraft({...draft,applicants:e.target.value})}/>
</label>
<label>IPC（分号分隔）<input value={draft.ipc} onChange={e=>setDraft({...draft,ipc:e.target.value})}/>
</label>
<label>来源链接<input type="url" value={draft.sourceUrl} onChange={e=>setDraft({...draft,sourceUrl:e.target.value})}/>
</label>
<label>摘要
<textarea aria-label="摘要" rows={4} value={draft.abstract} onChange={e=>setDraft({...draft,abstract:e.target.value})}/>
</label>
<details>
<summary>说明书与权利要求</summary>
<label>说明书
<textarea aria-label="说明书" rows={6} value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})}/>
</label>{draft.claims.map((c,i)=>
<label key={i}>权利要求 {c.number}<input aria-label={'权利要求编号 '+(i+1)} type="number" min={1} value={c.number} onChange={e=>setDraft({...draft,claims:draft.claims.map((v,j)=>j===i?{...v,number:Number(e.target.value)}:v)})}/>

<textarea required aria-label={'权利要求正文 '+c.number} rows={3} value={c.text} onChange={e=>setDraft({...draft,claims:draft.claims.map((v,j)=>j===i?{...v,text:e.target.value}:v)})}/>
<button type="button" onClick={()=>setDraft({...draft,claims:draft.claims.filter((_,j)=>j!==i)})}>移除此项</button>
</label>)}<button type="button" onClick={()=>setDraft({...draft,claims:[...draft.claims,{number:Math.max(0,...draft.claims.map(c=>c.number))+1,text:''}]})}>添加权利要求</button>
</details>{error&&<p className="error">{error}</p>}<div className="record-actions">
<button className="primary" disabled={busy}>保存</button>
<button type="button" onClick={()=>setDraft(undefined)}>取消</button>
</div>
</form>
</dialog>}
 </>;
}
