'use client';
import {useId,useState,type ReactNode} from 'react';
import {REPORT_TEMPLATES,formatReportMarkdown,type ReportTemplate} from '@/lib/report-template';
import {reportReading} from '@/lib/report-reading';
import type {AnalysisResult} from '@/lib/types';
import PatentNarrative from './PatentNarrative';
import Markdown from './MathMarkdown';
export default function ReportReader({text,results,onPatent,children,appendResults=false,template='standard',exportBase}:{text:string;results:AnalysisResult[];onPatent:(id:string,datasetId:string)=>void;children?:ReactNode;appendResults?:boolean;template?:ReportTemplate;exportBase?:string}){
 const prefix='report-'+useId().replace(/[^a-zA-Z0-9_-]/g,'')+'-';
 const [selectedTemplate,setSelectedTemplate]=useState<ReportTemplate>(template);
 const {sections,references,sources}=reportReading(formatReportMarkdown(text,selectedTemplate)),[active,setActive]=useState('');
 const headings=sections.filter(s=>s.level>0&&s.level<=3),toc=headings.filter(s=>s.level>1||!headings.some(h=>h.level===2));
 const citations={prefix,numbers:sources.map(s=>s.number)};
 function navigate(index:number){const id=prefix+'section-'+index;setActive(id);document.getElementById(id)?.scrollIntoView({block:'start'});}
 return <div className={'report-reading-layout report-template-'+selectedTemplate}><nav className="report-contents" aria-label="报告目录"><h3>报告目录</h3><label className="report-template-picker">输出版式<select aria-label="输出版式" value={selectedTemplate} onChange={e=>setSelectedTemplate(e.target.value as ReportTemplate)}>{REPORT_TEMPLATES.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label><p className="report-template-description">{REPORT_TEMPLATES.find(t=>t.id===selectedTemplate)!.description}</p>{exportBase&&<div className="report-template-downloads">{['html','docx','pdf','markdown'].map(format=><a key={format} href={exportBase.replace('{format}',format)+(exportBase.includes('?')?'&':'?')+'template='+selectedTemplate}>{({html:'HTML',docx:'Word',pdf:'PDF',markdown:'Markdown'})[format]}</a>)}</div>}{toc.map(s=>{const index=sections.indexOf(s),id=prefix+'section-'+index;return <button key={s.key} className={s.level>=3?'report-contents-sub':''} aria-current={active===id?'location':undefined} onClick={()=>navigate(index)}>{s.title.replace(/\*\*/g,'')}</button>;})}</nav><article className="markdown report-narrative">{children}{sections.map((s,index)=><section key={s.key} id={prefix+'section-'+index} className="report-reading-section">{s===references&&sources.length?<><Markdown>{'#'.repeat(s.level)+' '+s.title}</Markdown><ol className="report-reference-list">{sources.map(source=><li id={prefix+'source-'+source.number} value={source.number} key={source.number} tabIndex={-1}><Markdown>{source.text}</Markdown></li>)}</ol></>:<PatentNarrative text={s.text} results={results} onPatent={onPatent} appendResults={false} citations={citations}/>}</section>)}{appendResults&&<PatentNarrative text="" results={results.filter(r=>!text.includes('[[chart:'+r.id+']]'))} onPatent={onPatent}/>}</article></div>;
}
