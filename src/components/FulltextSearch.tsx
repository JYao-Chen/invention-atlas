'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import FulltextJobs from './FulltextJobs';
import type {PatentChunk} from '../server/patent-chunks';
type Version={version:string;done:number;total:number};
type Hit={chunk:PatentChunk;matches:string[];score?:number;similarity?:number};
type Source={chunk:PatentChunk;sourceText:string;sourceUrl:string;sourceName:string};
async function get(path:string,signal?:AbortSignal){const r=await fetch('/api/fulltext/'+path,{signal});const data=await r.json();if(!r.ok)throw Error(data.error||'全文检索失败');return data;}
const sections={abstract:'摘要',description:'说明书',claim:'权利要求'};
export default function FulltextSearch({datasetId,readOnly}:{datasetId:string;readOnly:boolean}){
 const [versions,setVersions]=useState<Version[]>([]),[version,setVersion]=useState(''),[query,setQuery]=useState(''),[hits,setHits]=useState<Hit[]>([]),[error,setError]=useState(''),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[source,setSource]=useState<Source>();
 const [scope,setScope]=useState<'current'|'historical'>('current');
 const dialog=useRef<HTMLDialogElement>(null),mark=useRef<HTMLElement>(null),request=useRef<AbortController|undefined>(undefined);
 const refreshVersions=useCallback(()=>{void get('versions?dataset='+encodeURIComponent(datasetId)).then(data=>{setVersions(data.versions);setVersion(previous=>previous||data.versions.at(-1)?.version||'');}).catch(e=>setError(e.message));},[datasetId]);
 useEffect(()=>{const control=new AbortController();void get('versions?dataset='+encodeURIComponent(datasetId),control.signal).then(data=>{setVersions(data.versions);setVersion(data.versions.at(-1)?.version||'');}).catch(e=>{if(!control.signal.aborted)setError(e.message);});return()=>{control.abort();request.current?.abort();};},[datasetId]);
 useEffect(()=>{if(source){dialog.current?.showModal();mark.current?.scrollIntoView({block:'center'});}else dialog.current?.close();},[source]);
 function clearSearch(){request.current?.abort();request.current=undefined;setBusy(false);setHits([]);setNote('');setError('');}
 async function search(){request.current?.abort();const control=new AbortController();request.current=control;setBusy(true);setError('');setHits([]);setNote('');try{const params=new URLSearchParams({dataset:datasetId,version,q:query,scope});const data=await get('search?'+params,control.signal);if(control.signal.aborted)return;setHits(data.hits||[]);setNote([data.reason||`返回 ${data.hits.length} 个片段；关键词与语义融合排序，不表示全部命中。`,data.warning].filter(Boolean).join(' '));}catch(e){if(!control.signal.aborted)setError((e as Error).message);}finally{if(request.current===control)setBusy(false);}}
 async function locate(chunk:PatentChunk){setError('');try{const params=new URLSearchParams({dataset:datasetId,version:chunk.documentVersion,patent:chunk.patentId,ordinal:String(chunk.ordinal)});setSource(await get('source?'+params));}catch(e){setError((e as Error).message);}}
 return <section className="fulltext-search"><h3>全文证据检索</h3>
 <FulltextJobs datasetId={datasetId} readOnly={readOnly} onComplete={refreshVersions}/>
 {versions.length?<form onSubmit={e=>{e.preventDefault();void search();}}><label>原文版本<select value={version} onChange={e=>{clearSearch();setVersion(e.target.value);}}>{versions.map(v=><option key={v.version} value={v.version}>{v.version} · 向量 {v.done}/{v.total}</option>)}</select></label><label>检索内容<select value={scope} onChange={e=>{clearSearch();setScope(e.target.value as 'current'|'historical');}}><option value="current">与当前原文一致的记录</option><option value="historical">指定版本的历史原文</option></select></label><label>技术问题或关键词<input required maxLength={7000} value={query} onChange={e=>{clearSearch();setQuery(e.target.value);}} placeholder="例如身份验证、网络通信机制"/></label><p className="muted">{scope==='current'?'已变化或移除的文档不使用旧索引；请为更新后的原文建立新版本。':'按所选版本阅读历史内容，可能与当前数据集不同；引用仍指向保存的原文版本。'}</p><button disabled={busy}>{busy?'正在检索…':'检索原文片段'}</button></form>:<p className="muted">当前数据集尚无全文片段索引。</p>}
 {error&&<p className="error" role="alert">{error}</p>}{note&&<p className="muted" role="status">{note}</p>}
 <ol className="fulltext-hits">{hits.map(hit=><li key={JSON.stringify([hit.chunk.patentId,hit.chunk.documentVersion,hit.chunk.ordinal])}><button onClick={()=>void locate(hit.chunk)}>{hit.chunk.patentId} · {sections[hit.chunk.section]}{hit.chunk.claimNumber?' '+hit.chunk.claimNumber:''} · 定位原文</button><small>{hit.matches.map(m=>m==='semantic'?'语义':'关键词').join(' + ')}{hit.similarity!==undefined?' · 余弦相似度 '+hit.similarity.toFixed(3):''}</small><p>{hit.chunk.text}</p></li>)}</ol>
 <dialog ref={dialog} className="workspace-manager fulltext-source" onCancel={()=>setSource(undefined)} onClose={()=>setSource(undefined)}>{source&&<><header><h3>{source.chunk.patentId} · {sections[source.chunk.section]}</h3><button onClick={()=>setSource(undefined)}>关闭</button></header><p className="muted">{source.chunk.documentVersion} · {source.sourceName}</p><pre>{source.sourceText.slice(0,source.chunk.start)}<mark ref={mark}>{source.chunk.text}</mark>{source.sourceText.slice(source.chunk.end)}</pre></>}</dialog>
 </section>;
}
