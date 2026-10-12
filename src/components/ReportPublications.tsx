'use client';
import {useEffect,useState} from 'react';
import ReportShareManager from './ReportShareManager';
import ReportDocumentDownloads from './ReportDocumentDownloads';
type Publication={edition:number;revision:number;published_at:string;publisher_name:string};
export default function ReportPublications({reportId,revision,latest,readOnly}:{reportId:string;revision:number;latest:number;readOnly:boolean}){
 const [rows,setRows]=useState<Publication[]>([]),[busy,setBusy]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState('');
 async function refresh(signal?:AbortSignal){const response=await fetch('/api/reports/'+reportId+'/publications',{signal}),data=await response.json();if(!response.ok)throw new Error(data.error||'读取发布记录失败');setRows(data.publications);}
 useEffect(()=>{const controller=new AbortController();setBusy(true);setMessage('');void refresh(controller.signal).catch(e=>{if(!controller.signal.aborted)setError((e as Error).message);}).finally(()=>{if(!controller.signal.aborted)setBusy(false);});return()=>controller.abort();},[reportId]);
 async function publish(){
  if(!confirm('发布已保存的'+(revision?'草稿第'+revision+'版':'原始报告')+'？未保存的编辑不会包含在发布版本中。发布后正文和分析快照保持不变。'))return;
  setBusy(true);setError('');setMessage('');
  try{const response=await fetch('/api/reports/'+reportId+'/publications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedRevision:revision})}),data=await response.json();if(!response.ok)throw new Error(data.error||'发布报告失败');await refresh();setMessage('已发布第'+data.edition+'版。');}catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 const published=rows.some(row=>row.revision===revision);
 return <details className="report-publications"><summary>正式发布 · {rows.length}版</summary>
  <p className="muted">发布固定已保存的正文、研究范围和工具结果。后续草稿不改变发布版本；发布状态不代表法律意见或质量认证。</p>
  {!readOnly&&<div className="record-actions"><button type="button" disabled={busy||revision!==latest||published} onClick={()=>void publish()}>{published?'当前版本已发布':'发布当前保存版本'}</button>{revision!==latest&&<span className="muted">请先选择最新草稿。</span>}</div>}
  {busy&&<p role="status">正在读取或保存发布记录…</p>}
  {!busy&&!rows.length&&<p className="muted">尚未发布。草稿仍可编辑和下载。</p>}
  {rows.map(row=><div className="publication-row" key={row.edition}><div><strong>发布第{row.edition}版</strong><p className="muted">{row.revision?'草稿第'+row.revision+'版':'原始报告'} · {row.publisher_name} · {new Date(row.published_at).toLocaleString()}</p></div><div><div className="record-actions"><a className="button" target="_blank" rel="noopener" href={'/api/reports/'+reportId+'/publications/'+row.edition+'/view'}>阅读发布版</a><a className="button" href={'/api/reports/'+reportId+'/publications/'+row.edition+'/html'}>下载 HTML</a></div><ReportDocumentDownloads baseUrl={'/api/reports/'+reportId+'/publications/'+row.edition} filename={'patent-report-'+reportId+'-edition-'+row.edition}/></div></div>)}
  {message&&<p role="status">{message}</p>}{error&&<p role="alert" className="error">{error}</p>}
  {!readOnly&&rows.map(row=><div key={'share:'+row.edition}><h4>发布第{row.edition}版授权</h4><ReportShareManager reportId={reportId} revision={row.revision} edition={row.edition}/></div>)}
 </details>;
}
