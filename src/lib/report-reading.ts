import {reportSections} from './report-sections';
export type ReportSource={number:number;text:string};
export function reportReading(text:string){
 const sections=reportSections(text).filter(s=>s.text.trim());
 const references=sections.find(s=>/^(资料来源|参考文献|参考资料|引用来源)$/.test(s.title));
 const sources:ReportSource[]=references?[...references.text.matchAll(/^(\d+)\.\s+(.+?)(?=\n\d+\.\s|$)/gms)].map(m=>({number:Number(m[1]),text:m[2].trim()})):[];
 return {sections,references,sources};
}
type Node={type:string;value?:string;url?:string;children?:Node[]};
export type CitationOptions={prefix:string;numbers:number[]};
// Transform prose text only: existing links, code and math retain their meaning.
export function reportCitationPlugin(options:CitationOptions){
 const known=new Set(options.numbers);
 return (tree:Node)=>{
  function visit(node:Node){
   if(['link','code','inlineCode','math','inlineMath','definition','heading'].includes(node.type)||!node.children)return;
   node.children=node.children.flatMap(child=>{
    if(child.type!=='text'){visit(child);return [child];}
    const value=child.value||'',parts:Node[]=[];let start=0;
    for(const match of value.matchAll(/\[(\d+(?:\s*[,，–-]\s*\d+)*)\]/g)){
     const raw=match[1],range=raw.match(/^(\d+)\s*[–-]\s*(\d+)$/);
     const numbers=range&&Number(range[2])-Number(range[1])<=20?Array.from({length:Math.max(0,Number(range[2])-Number(range[1])+1)},(_,i)=>Number(range[1])+i):raw.split(/[,，]/).map(Number);
     if(!numbers.length||!numbers.every(n=>known.has(n)))continue;
     parts.push({type:'text',value:value.slice(start,match.index)});
     numbers.forEach(n=>parts.push({type:'link',url:'#'+options.prefix+'source-'+n,children:[{type:'text',value:'['+n+']'}]}));start=match.index!+match[0].length;
    }
    if(!parts.length)return [child];parts.push({type:'text',value:value.slice(start)});return parts;
   });
  }
  visit(tree);
 };
}
