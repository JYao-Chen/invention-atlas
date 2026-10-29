import {fromMarkdown} from 'mdast-util-from-markdown';
import {gfm} from 'micromark-extension-gfm';
import {gfmFromMarkdown} from 'mdast-util-gfm';
import {reportSections} from '../lib/report-sections';
import type {AnalysisResult,ReportConclusion} from '../lib/types';
export const patentNumberPattern=/\b[A-Z]{2}(?:RE|PP|[DHT])?\d+(?:[A-Z]\d?)?\b/gi;

export function resultPatentNumbers(result:AnalysisResult){
 const ids=new Set(result.evidence.map(id=>id.toUpperCase()));
 const visit=(value:unknown)=>{if(typeof value==='string')for(const match of value.matchAll(patentNumberPattern))ids.add(match[0].toUpperCase());else if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')Object.values(value).forEach(visit);};
 visit(result.rows);visit(result.rowSources);visit(result.graph);visit(result.clusterMap);
 return ids;
}

// Version-local, positional anchors never change after a report snapshot is saved.
// Exact, occurrence-aware matches provide links across adjacent revisions without
// pretending a rewritten paragraph is the same assertion.
export function reportConclusions(reportId:string,revision:number,answer:string,results:AnalysisResult[],previous:ReportConclusion[]=[]):ReportConclusion[]{
 const entries:ReportConclusion[]=[],patents=results.map(resultPatentNumbers);
 for(const section of reportSections(answer)){
  const tree=fromMarkdown(section.text,{extensions:[gfm()],mdastExtensions:[gfmFromMarkdown()]});
  const blocks:{text:string;start:number;end:number}[]=[];
  const visit=(node:typeof tree.children[number])=>{
   if(['paragraph','table'].includes(node.type)&&node.position){const start=node.position.start.offset!,end=node.position.end.offset!;blocks.push({text:section.text.slice(start,end),start:section.start+start,end:section.start+end});}
   else if('children' in node&&node.type!=='heading'&&node.type!=='table')for(const child of node.children)visit(child as typeof node);
  };
  tree.children.forEach(visit);
  for(const block of blocks){
   const markers=[...block.text.matchAll(/\[\[chart:([^\]]+)\]\]/g)].map(m=>m[1]);
   if(!block.text.replace(/\[\[chart:[^\]]+\]\]/g,'').trim()){
    const prior=entries.at(-1);if(prior?.section===section.key){prior.resultIds=[...new Set([...prior.resultIds,...markers.filter(id=>results.some(r=>r.id===id))])];prior.tools=[...new Set(results.filter(r=>prior.resultIds.includes(r.id)).map(r=>r.tool))];}continue;
   }
   const patentNumbers=[...new Set([...block.text.replace(/\[\[chart:[^\]]+\]\]/g,'').matchAll(patentNumberPattern)].map(m=>m[0].toUpperCase()))];
   const linked=results.filter((r,i)=>markers.includes(r.id)||patentNumbers.some(id=>patents[i].has(id)));
   entries.push({id:reportId+':v'+revision+':p'+(entries.length+1),reportId,revision,section:section.key,sectionTitle:section.title,text:block.text,start:block.start,end:block.end,patentNumbers,resultIds:linked.map(r=>r.id),tools:[...new Set(linked.map(r=>r.tool))]});
  }
 }
 const available=new Map<string,ReportConclusion[]>();
 for(const entry of previous){const key=JSON.stringify([entry.section,entry.text]);available.set(key,[...(available.get(key)||[]),entry]);}
 for(const entry of entries){const old=available.get(JSON.stringify([entry.section,entry.text]))?.shift();if(old)entry.previousId=old.id;}
 return entries;
}
