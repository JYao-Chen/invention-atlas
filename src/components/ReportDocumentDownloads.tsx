'use client';
import {useEffect,useRef,useState} from 'react';

export default function ReportDocumentDownloads({baseUrl,filename}:{baseUrl:string;filename:string}){
 const [busy,setBusy]=useState(''),[error,setError]=useState('');
 const active=useRef<AbortController|null>(null);
 useEffect(()=>()=>active.current?.abort(),[]);
 async function download(format:'docx'|'pdf'){
  if(active.current)return;
  const controller=new AbortController();active.current=controller;setBusy(format);setError('');
  try{
   const [path,query]=baseUrl.split('?');
   const response=await fetch(path+'/'+format+(query?'?'+query:''),{signal:controller.signal});
   if(!response.ok){const data=await response.json();throw new Error(data.error||'下载失败，请重试。');}
   const blob=await response.blob();if(controller.signal.aborted)return;
   const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename+'.'+format;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){if(!controller.signal.aborted)setError((e as Error).message);}
  finally{if(!controller.signal.aborted){setBusy('');active.current=null;}}
 }
 return <div className="report-document-downloads">
  <div className="record-actions"><button type="button" disabled={Boolean(busy)} onClick={()=>void download('docx')}>{busy==='docx'?'正在生成 Word…':'下载 Word'}</button><button type="button" disabled={Boolean(busy)} onClick={()=>void download('pdf')}>{busy==='pdf'?'正在生成 PDF…':'下载 PDF'}</button></div>
  {busy&&<p className="muted" role="status">正在准备所选版本，完成后自动下载。</p>}
  {error&&<p className="error" role="alert">{error}</p>}
 </div>;
}
