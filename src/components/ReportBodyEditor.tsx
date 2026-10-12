'use client';
import {useState} from 'react';
import {reportSections,replaceReportSection,type ReportSection} from '@/lib/report-sections';

export default function ReportBodyEditor({answer,disabled}:{answer:string;disabled:boolean}){
 const [body,setBody]=useState(answer),[selected,setSelected]=useState<ReportSection>();
 const sections=reportSections(body);
 return <>
  <input type="hidden" name="answer" value={body}/>
  <label>编辑范围<select aria-label="编辑报告章节" disabled={disabled} value={selected?String(selected.start):'all'} onChange={e=>setSelected(e.target.value==='all'?undefined:sections.find(section=>section.start===Number(e.target.value)))}>
   <option value="all">整篇正文</option>{sections.map(section=><option key={section.start} value={section.start}>{section.title}</option>)}
  </select></label>
  <label>草稿正文<textarea aria-label="草稿正文" rows={16} maxLength={1000000} disabled={disabled} value={selected?selected.text:body} onChange={e=>{
   const text=e.target.value;if(!selected){setBody(text);return;}
   const next=replaceReportSection(body,selected,text),end=selected.end+next.length-body.length;
   setBody(next);setSelected({...selected,end,text:next.slice(selected.start,end)});
  }}/></label>
  {selected&&<p className="muted">仅编辑当前章节；保存时保留其他章节。章节标题和图表引用也属于正文。</p>}
 </>;
}
