'use client';
import {useEffect,useState} from 'react';
import type {Dataset} from '@/lib/types';
type Material={id:string;filename:string;format:string;extraction:{warnings:string[];pages:{page:number|null;text:string;status:string}[]}};
type Job={id:string;state:string;done:number;payload:{pages:number[]};error:string};
async function request(path='',method='GET',body?:BodyInit,signal?:AbortSignal){const response=await fetch('/api/materials'+path,{method,body,signal,headers:typeof body==='string'?{'Content-Type':'application/json'}:undefined});const data=await response.json();if(!response.ok)throw new Error(data.error||'材料操作失败');return data;}
export default function ProjectMaterials({readOnly,datasets=[]}:{readOnly:boolean;datasets?:Pick<Dataset,'id'|'name'|'count'>[]}){
 const [items,setItems]=useState<Material[]>([]),[selected,setSelected]=useState<Material>(),[jobs,setJobs]=useState<Job[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[offset,setOffset]=useState(0),[next,setNext]=useState<number|null>(null);
 const [recognized,setRecognized]=useState<{page:number;text:string}[]|null>(null),[jobsLoading,setJobsLoading]=useState(false),[message,setMessage]=useState('');
 const [proposalSource,setProposalSource]=useState('original');
 const states:Record<string,string>={queued:'排队中',running:'识别中',completed:'已完成',failed:'识别失败',cancelled:'已取消'};
 function select(material:Material){setJobs([]);setRecognized(null);setProposalSource('original');setJobsLoading(true);setSelected(material);}
 async function list(page:number,signal?:AbortSignal){const data=await request('?offset='+page,'GET',undefined,signal);setItems(data.materials);setNext(data.nextOffset);setOffset(page);}
 useEffect(()=>{const controller=new AbortController();void list(0,controller.signal).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[]);
 useEffect(()=>{if(!selected)return;const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;const poll=async()=>{try{const data=await request('/'+selected.id+'/ocr','GET',undefined,controller.signal);if(controller.signal.aborted)return;setJobs(data.jobs);setJobsLoading(false);if(data.jobs.some((job:Job)=>['queued','running'].includes(job.state)))timer=setTimeout(poll,1000);}catch(e){if(!controller.signal.aborted){setJobsLoading(false);setError((e as Error).message);}}};void poll();return()=>{controller.abort();clearTimeout(timer);};},[selected]);
 async function act(work:()=>Promise<void>){setBusy(true);setError('');setMessage('');try{await work();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <details className="project-materials"><summary>原始材料与文字识别</summary>
  <p className="muted">保存 PDF、Word 或 UTF-8 文本，查看提取内容。识别文本与原文件分别保留。</p>
  {!readOnly&&<label>上传材料<input type="file" accept=".pdf,.docx,.txt,.md" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(!file)return;e.target.value='';void act(async()=>{const form=new FormData();form.append('file',file);const material=await request('','POST',form);select(material);setItems(current=>[material,...current.filter(item=>item.id!==material.id)]);setMessage('材料已上传。');try{await list(0);}catch{setError('材料已上传，但列表刷新失败；已打开保存的材料，请勿重复上传。');}});}}/></label>}
  {loading?<p role="status">正在读取材料…</p>:items.length===0?<p>当前页没有材料。</p>:<ul>{items.map(item=><li key={item.id}><button disabled={busy} onClick={()=>void act(async()=>{select(await request('/'+item.id));})}>{item.filename}</button></li>)}</ul>}
  <div className="record-actions"><button disabled={busy||offset===0} onClick={()=>void act(()=>list(Math.max(0,offset-50)))}>上一页</button><button disabled={busy||next===null} onClick={()=>void act(()=>list(next!))}>下一页</button></div>
  {selected&&<section aria-label="材料详情"><h4>{selected.filename}</h4><a href={'/api/materials/'+selected.id+'/original'}>下载原文件</a>
   {selected.extraction.warnings.map((warning,i)=><p className="muted" key={i}>{warning}</p>)}
   {selected.extraction.pages.map((page,i)=><details key={i}><summary>{page.page===null?'提取正文':'第'+page.page+'页'}{page.status==='needs_ocr'?' · 待识别':''}</summary><pre>{page.text||'没有提取到文字。'}</pre></details>)}
   {!readOnly&&selected.format==='pdf'&&<button disabled={busy||jobs.some(job=>['queued','running'].includes(job.state))} onClick={()=>void act(async()=>{await request('/'+selected.id+'/ocr','POST','{}');setSelected({...selected});})}>识别待处理页</button>}
   {jobsLoading&&<p role="status">正在读取识别任务…</p>}
   {jobs.map(job=><div key={job.id}><p>文字识别 · {states[job.state]||'状态未知'} · {job.done}/{job.payload.pages.length}页</p><progress aria-label="已保存识别页数" value={job.done} max={job.payload.pages.length}/>{job.error&&<p role="alert">{job.error}</p>}
    <button disabled={busy} onClick={()=>void act(async()=>{const result=await request('/'+selected.id+'/ocr/'+job.id);setRecognized(result.pages);})}>查看识别结果</button>
    {!readOnly&&['queued','running','failed','cancelled'].includes(job.state)&&<button disabled={busy} onClick={()=>void act(async()=>{await request('/'+selected.id+'/ocr/'+job.id+'/'+(['queued','running'].includes(job.state)?'cancel':'retry'),'POST');setSelected({...selected});})}>{['queued','running'].includes(job.state)?'取消识别':'继续识别'}</button>}
   </div>)}
   {recognized!==null&&<section aria-label="OCR衍生文本"><h4>识别文本</h4>{recognized.length===0?<p role="status">尚无已保存的识别结果。</p>:recognized.map(page=><details key={page.page}><summary>第{page.page}页 · OCR</summary><pre>{page.text||'未识别到文字。'}</pre></details>)}</section>}
   {!readOnly&&<details><summary>从材料创建查新任务</summary><p className="muted">所选文本作为技术方案输入保存，后续仍需确认特征；背景技术和OCR识别结果不自动视为本方案事实。</p><form key={selected.id} className="material-novelty-form" onSubmit={event=>{event.preventDefault();const fields=new FormData(event.currentTarget);void act(async()=>{const pageText=String(fields.get('pages')||'').trim(),pages=pageText?pageText.split(/[,，\s]+/).map(value=>Number(value)):undefined;if(pages&&(pages.some(page=>!Number.isInteger(page)||page<1)||new Set(pages).size!==pages.length))throw new Error('页码须为不重复的正整数，用逗号分隔。');const task=await request('/'+selected.id+'/novelty','POST',JSON.stringify({datasetId:String(fields.get('datasetId')||''),...(proposalSource==='original'?{}:{ocrJobId:proposalSource}),...(pages?{pages}:{})}));setMessage('已创建技术方案查新任务 '+task.id+'。请从专业任务入口准备并确认方案特征。');});}}>
    <label>查新数据集<select name="datasetId" required disabled={busy||!datasets.length}>{datasets.map(dataset=><option key={dataset.id} value={dataset.id}>{dataset.name} · {dataset.count} 条</option>)}</select></label>
    <label>方案文本来源<select value={proposalSource} disabled={busy||jobsLoading} onChange={event=>setProposalSource(event.target.value)}><option value="original">原始提取文本</option>{jobs.filter(job=>job.state==='completed').map(job=><option key={job.id} value={job.id}>已完成OCR · {job.done} 页 · {job.id.slice(0,8)}</option>)}</select></label>
    {selected.format==='pdf'&&<label>选择页码（可留空）<input name="pages" disabled={busy} placeholder="例如 1, 3, 5"/><small className="muted">留空使用所选来源全部页；页码对应原文件，不是OCR结果序号。</small></label>}
    {!datasets.length&&<p>当前项目没有可用数据集，请先创建或导入专利数据。</p>}
    <button disabled={busy||jobsLoading||!datasets.length}>创建查新任务</button>
   </form></details>}
   {!readOnly&&<details><summary>材料管理</summary><button disabled={busy} onClick={()=>{if(confirm('移除该材料并取消活动识别任务？原文件仍保留，可通过接口恢复。'))void act(async()=>{await request('/'+selected.id,'DELETE');setSelected(undefined);await list(offset);});}}>移除材料</button></details>}
  </section>}{busy&&<p role="status">正在处理材料…</p>}{message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}
 </details>;
}
