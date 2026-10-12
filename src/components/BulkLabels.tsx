'use client';
import {useRef,useState} from 'react';
type Label={id:string;name:string};
export default function BulkLabels({datasetId,patentIds,disabled}:{datasetId:string;patentIds:string[];disabled:boolean}){
 const dialog=useRef<HTMLDialogElement>(null),[labels,setLabels]=useState<Label[]>([]),[labelId,setLabelId]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 async function open(){dialog.current?.showModal();setBusy(true);setError('');setMessage('');setLabelId('');try{const response=await fetch('/api/project-labels'),data=await response.json();if(!response.ok)throw new Error(data.error||'读取标签失败');setLabels(data.labels);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function apply(mode:'attach'|'detach'){
  const name=labels.find(label=>label.id===labelId)?.name;if(!window.confirm(`${mode==='attach'?'添加':'移除'}“${name}”标签：${patentIds.length}件所选专利。${mode==='detach'?'已有笔记正文保留。':''}继续？`))return;
  setBusy(true);setError('');try{const response=await fetch('/api/patent-annotations/bulk-label',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({datasetId,patentIds,labelId,mode})}),result=await response.json();if(!response.ok)throw new Error(result.error||'批量标引失败');setMessage(`已处理 ${result.selected} 件专利，${mode==='attach'?'新增':'移除'} ${result.changed} 条标引。`);dialog.current?.close();}catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <><button disabled={disabled||!patentIds.length} onClick={()=>void open()}>批量标签（{patentIds.length}）</button>{message&&<small role="status">{message}</small>}<dialog ref={dialog} className="workspace-manager" onCancel={e=>{if(busy)e.preventDefault();}}>
  <header><h2>批量标签</h2><button disabled={busy} onClick={()=>dialog.current?.close()} aria-label="关闭批量标签">关闭</button></header>
  <p>已选择 {patentIds.length} 件专利，包含跨页勾选记录。</p>{patentIds.length>500&&<p role="alert" className="error">单批最多500件，请减少选择后再执行。</p>}
  <label>选择项目标签<select aria-label="批量项目标签" value={labelId} disabled={busy} onChange={e=>setLabelId(e.target.value)}><option value="">选择标签</option>{labels.map(label=><option key={label.id} value={label.id}>{label.name}</option>)}</select></label>
  {!busy&&!labels.length&&<p className="muted">暂无项目标签。可先在专利原文页创建标签。</p>}
  <p className="muted">移除标签保留已有笔记正文，不删除专利。</p><div className="annotation-actions"><button disabled={busy||!labelId||patentIds.length>500} onClick={()=>void apply('attach')}>添加到所选专利</button><button disabled={busy||!labelId||patentIds.length>500} onClick={()=>void apply('detach')}>从所选专利移除</button></div>
  {error&&<p role="alert" className="error">{error}</p>}
 </dialog></>;
}
