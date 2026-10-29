'use client';
import {useEffect,useState} from 'react';
import {ArrowUpRight} from 'lucide-react';

type Source={name:string;version:string;license:string};
type Coverage={total:number;uniqueNumbers:number;grants:number;unrecognized:number;covered:{bibliographic:number;forward_citations:number;maintenance:number;paper_links:number};completedScans:{purpose:string;patents:number}[];sources:Source[];warnings:string[]};
type Paper={workId:string;confidence:number|null;referenceTypes:string[];whereFound:string[];paper:{doi?:string|null;title?:string|null;year?:number|null;venue?:string|null;cited_by_count?:number|null}|null};
const sourceNames:Record<string,string>={science:'Reliance on Science',openalex:'OpenAlex'};
const whereNames:Record<string,string>={frontonly:'首页引文',bodyonly:'正文引用',both:'首页与正文'};
const NONCOMMERCIAL='专利—论文关联来自 Reliance on Science（CC BY-NC 4.0），仅限非商业用途。';
const sourceLine=(sources:Source[])=>sources.map(s=>(sourceNames[s.name]||s.name)+' '+s.version+' · '+s.license).join('；');

async function read<T>(url:string):Promise<T>{const response=await fetch(url),data=await response.json();if(!response.ok)throw new Error(data.error||'读取外部参考数据失败');return data;}

// Dataset-level coverage of the imported open reference data; counts are observed records, not proof of absence.
export function ExternalCoverage({datasetId}:{datasetId:string}){
 const [coverage,setCoverage]=useState<Coverage>(),[error,setError]=useState('');
 useEffect(()=>{void read<Coverage>('/api/datasets/'+datasetId+'/external-coverage').then(setCoverage,e=>setError((e as Error).message));},[datasetId]);
 if(error)return <p className="field-help">外部参考数据暂不可读：{error}</p>;
 if(!coverage)return null;
 const scanned=coverage.completedScans.find(s=>s.purpose==='D4')?.patents??0;
 const rows:[string,number,string][]=[['关联科学论文',coverage.covered.paper_links,'Reliance on Science 专利—论文引用，论文信息取自 OpenAlex'],['书目信息',coverage.covered.bibliographic,'USPTO 开放数据，需要 API 密钥，当前未导入'],['被引专利',coverage.covered.forward_citations,'USPTO 开放数据，当前未导入'],['年费维持',coverage.covered.maintenance,'USPTO 开放数据，当前未导入']];
 return <section className="external-coverage" aria-labelledby="external-coverage-title">
  <div className="list-heading"><h3 id="external-coverage-title">外部参考数据 <small>{coverage.uniqueNumbers} 个编号</small></h3></div>
  <dl className="external-coverage-grid">{rows.map(([label,count,help])=><div key={label} data-empty={count===0||undefined}><dt>{label}</dt><dd>{count}<small> / {coverage.uniqueNumbers}</small></dd><p>{help}</p></div>)}</dl>
  <p className="field-help">已在论文关联来源中核对 {scanned} 个编号；没有关联记录不代表该专利未引用论文。{coverage.covered.paper_links>0&&NONCOMMERCIAL}{coverage.sources.length>0&&' 来源：'+sourceLine(coverage.sources)+'。'}</p>
 </section>;
}

// Papers a patent cites according to Reliance on Science, merged per work and enriched with OpenAlex metadata.
export function PatentPapers({patentId}:{patentId:string}){
 const [papers,setPapers]=useState<Paper[]>(),[sources,setSources]=useState<Source[]>([]),[error,setError]=useState(''),[all,setAll]=useState(false);
 useEffect(()=>{void read<{papers:Paper[];sources:Source[]}>('/api/patents/'+encodeURIComponent(patentId)+'/papers').then(data=>{setPapers(data.papers);setSources(data.sources);},e=>setError((e as Error).message));},[patentId]);
 if(error)return <p className="field-help">关联论文暂不可读：{error}</p>;
 if(!papers?.length)return null;
 const shown=all?papers:papers.slice(0,8);
 return <section className="patent-papers" aria-labelledby={'papers-'+patentId}>
  <h3 id={'papers-'+patentId}>关联科学论文 <small>{papers.length} 篇</small></h3>
  <ol>{shown.map(item=><li key={item.workId}>
   <div className="patent-paper-title">{item.paper?.doi?<a href={'https://doi.org/'+item.paper.doi.replace(/^https?:\/\/doi\.org\//,'')} target="_blank" rel="noreferrer">{item.paper.title||item.workId}<ArrowUpRight size={13}/></a>:<a href={'https://openalex.org/'+item.workId} target="_blank" rel="noreferrer">{item.paper?.title||item.workId}<ArrowUpRight size={13}/></a>}</div>
   <div className="muted">{[item.paper?.year,item.paper?.venue,item.paper?.cited_by_count!=null?'被引 '+item.paper.cited_by_count:null,item.whereFound.map(w=>whereNames[w]||w).join('、'),item.confidence!=null?'置信度 '+item.confidence+'/10':null].filter(Boolean).join(' · ')}{!item.paper&&' · OpenAlex 未收录元数据'}</div>
  </li>)}</ol>
  {papers.length>8&&<button type="button" className="link-button" onClick={()=>setAll(v=>!v)}>{all?'收起':'显示全部 '+papers.length+' 篇'}</button>}
  <p className="field-help">{NONCOMMERCIAL}{sources.length>0&&' 版本：'+sourceLine(sources)+'。'}</p>
 </section>;
}
