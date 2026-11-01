import {reportSections} from './report-sections';
import type {Run} from './types';
export const REPORT_TEMPLATES=[
 {id:'standard',title:'专业报告',description:'章、节分级编号，适合完整研究报告。'},
 {id:'academic',title:'研究论文',description:'十进制编号，衬线正文，适合研究论证。'},
 {id:'brief',title:'决策简报',description:'紧凑排版与无衬线正文，便于快速阅读。'},
] as const;
export type ReportTemplate=typeof REPORT_TEMPLATES[number]['id'];
export function isReportTemplate(value:unknown):value is ReportTemplate{return REPORT_TEMPLATES.some(t=>t.id===value);}
export function templateTitle(title:string){return title.replace(/^第\d+章[ \u3000]+|^\d+(?:\.\d+)*\u3000/,'');}
const frontMatter=/^(摘要|内容摘要|执行摘要|资料来源|参考文献|参考资料|引用来源|附录.*)$/;
/** Number presentation headings without touching body, code, citations or saved drafts. */
export function formatReportMarkdown(text:string,template:ReportTemplate='standard',startChapter=1){
 const sections=reportSections(text),levels=sections.filter(s=>s.level>1&&!frontMatter.test(templateTitle(s.title))).map(s=>s.level);
 const base=Math.min(...levels),counters:number[]=[startChapter-1];
 return sections.map(section=>{
  if(section.level<2)return section.text;
  const title=templateTitle(section.title);
  if(frontMatter.test(title)){counters.length=0;return section.text;}
  const depth=section.level-base;counters.length=depth+1;counters[depth]=(counters[depth]||0)+1;
  for(let i=0;i<depth;i++)counters[i]||=1;
  const number=template==='standard'&&depth===0?'第'+counters[0]+'章':counters.join('.');
  return section.text.replace(/^(#{2,6})[ \t]+[^\n]*/,(_,marks:string)=>marks+' '+number+'\u3000'+title);
 }).join('');
}
export function reportChapterBody(body:string){
 return reportSections(body).map(section=>section.level>0&&section.level<3?section.text.replace(/^#{1,2}[ \t]+/,'### '):section.text).join('');
}
export function presentReport<T extends {run:Run}>(report:T,template:ReportTemplate=report.run.reportTemplate||'standard'):T{
 return {...report,run:{...report.run,reportTemplate:template,answer:formatReportMarkdown(report.run.answer,template)}};
}
