'use client';
import {useEffect,useState} from 'react';
export type RecordLabelSelection={id:string;includeChildren:boolean}|null;
type Label={id:string;name:string;parent_id:string|null};
export default function RecordLabelFilter({value,onApply,readOnly=false}:{value:RecordLabelSelection;onApply:(filter:RecordLabelSelection)=>Promise<void>;readOnly?:boolean}){
 const [labels,setLabels]=useState<Label[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function refresh(){try{const response=await fetch('/api/project-labels'),data=await response.json();if(!response.ok)throw new Error(data.error||'读取标签失败');setLabels(data.labels);}catch(e){setError((e as Error).message);}}
 useEffect(()=>{void refresh();},[]);
 async function apply(filter:RecordLabelSelection){setBusy(true);setError('');try{await onApply(filter);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function change(label:Label,name?:string){if(name===undefined&&!window.confirm('删除项目标签“'+label.name+'”？有子标签或笔记引用时不能删除。'))return;setBusy(true);setError('');try{const response=await fetch('/api/project-labels/'+label.id,{method:name===undefined?'DELETE':'PATCH',headers:name===undefined?undefined:{'Content-Type':'application/json'},body:name===undefined?undefined:JSON.stringify({name})}),data=await response.json();if(!response.ok)throw new Error(data.error||'更新标签失败');if(name===undefined&&value?.id===label.id)await onApply(null);await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <div className="record-label-filter"><div className="record-label-toolbar"><label className="record-label-select">标签筛选<select aria-label="筛选项目标签" value={value?.id||''} disabled={busy} onChange={e=>void apply(e.target.value?{id:e.target.value,includeChildren:value?.includeChildren||false}:null)}><option value="">全部专利</option>{labels.map(label=><option key={label.id} value={label.id}>{label.parent_id?(labels.find(parent=>parent.id===label.parent_id)?.name||'')+' / ':''}{label.name}</option>)}</select></label>
  <label className="record-label-children"><input type="checkbox" disabled={busy||!value} checked={value?.includeChildren||false} onChange={e=>{if(value)void apply({...value,includeChildren:e.target.checked});}}/>包含子标签</label>
  <button disabled={busy} onClick={()=>void refresh()}>刷新标签</button>{value&&<button disabled={busy} onClick={()=>void apply(null)}>清除标签筛选</button>}</div>{error&&<p role="alert" className="error">{error}</p>}
 {!readOnly&&<details className="record-label-manager"><summary>管理项目标签</summary>{labels.map(label=><form key={label.id+label.name} className="record-label-edit" onSubmit={e=>{e.preventDefault();void change(label,String(new FormData(e.currentTarget).get('name')).trim());}}><label>标签名称<input aria-label={'修改标签 '+label.name} name="name" defaultValue={label.name} required maxLength={100} disabled={busy}/></label><button disabled={busy}>保存标签名称</button><button type="button" disabled={busy} onClick={()=>void change(label)}>删除标签</button></form>)}{!labels.length&&<p className="muted">暂无项目标签，可在专利原文页创建。</p>}</details>}
 </div>;
}
