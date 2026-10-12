import {z} from 'zod';
const evidence=z.object({patentId:z.string(),documentVersion:z.string(),section:z.string(),claimNumber:z.number().optional(),start:z.number().int(),end:z.number().int(),quote:z.string().min(1)}).passthrough();
export type NoveltyCitation=z.infer<typeof evidence>&{citationId:string};
export function numberedNoveltyCitations(input:unknown){
 const data=z.object({documents:z.array(z.object({batches:z.array(z.object({comparisons:z.array(z.object({evidence:z.array(evidence)}).passthrough())}).passthrough())}).passthrough())}).passthrough().parse(input);
 const citations:NoveltyCitation[]=[];
 const documents=data.documents.map(document=>({...document,batches:document.batches.map(batch=>({...batch,comparisons:batch.comparisons.map(row=>({...row,evidence:row.evidence.map(reference=>{const numbered={...reference,citationId:'E'+(citations.length+1)};citations.push(numbered);return numbered;})}))}))}));
 return {comparison:{...data,documents},citations};
}
export function noveltyCitationWritingInput(input:ReturnType<typeof numberedNoveltyCitations>['comparison']){
 return {...input,documents:input.documents.map(document=>({...document,batches:document.batches.map(batch=>({...batch,comparisons:batch.comparisons.map(row=>({...row,evidence:row.evidence.map(reference=>{const {quote,...citation}=reference;return {...citation,quoteStored:true};})}))}))})),citationPolicy:'原文仅由程序按citationId插入；撰写模型只组织已确认对照说明，不重复生成引文，不重新判定对应状态。'};
}
export function resolveNoveltyCitations(text:string,citations:NoveltyCitation[]){
 const malformed=[...text.matchAll(/\[\[evidence:[^\n]*?(?:\]\]|$)/gm)].map(match=>match[0]).find(token=>!/^\[\[evidence:E\d+\]\]$/.test(token));
 if(malformed)throw new Error('报告证据引用格式不完整：'+malformed.slice(0,100));
 return text.replace(/\[\[evidence:(E\d+)\]\]/g,(_token,id:string)=>{
  const reference=citations.find(c=>c.citationId===id);if(!reference)throw new Error('报告引用了不存在的证据：'+id);
  const section=reference.section==='claim'?'权利要求 '+reference.claimNumber:reference.section==='claims'?'权利要求全文':reference.section==='description'?'说明书':reference.section==='abstract'?'摘要':reference.section==='Background/Summary'?'背景与概要':reference.section==='Description'||reference.section==='Detailed Description'?'说明书':reference.section;
  return '\n\n'+reference.quote.split('\n').map(line=>'> '+line).join('\n')+'\n\n'+`（证据 ${id} · ${reference.patentId} · ${section} · 原文位置 ${reference.start}—${reference.end}）`+'\n\n';
 });
}

export function noveltyCitationStream(citations:NoveltyCitation[],emit:(text:string)=>Promise<unknown>){
 const prefix='[[evidence:';let pending='',raw='';
 return {
  async push(text:string){
   raw+=text;pending+=text;
   while(pending){
    const start=pending.indexOf(prefix);
    if(start<0){let keep=0;for(let size=1;size<prefix.length;size++)if(prefix.startsWith(pending.slice(-size)))keep=size;const ready=pending.slice(0,pending.length-keep);if(ready)await emit(ready);pending=pending.slice(pending.length-keep);break;}
    if(start){await emit(pending.slice(0,start));pending=pending.slice(start);}
    const end=pending.indexOf(']]');if(end<0)break;
    await emit(resolveNoveltyCitations(pending.slice(0,end+2),citations));pending=pending.slice(end+2);
   }
  },
  async finish(){if(pending){if(prefix.startsWith(pending)||pending.startsWith(prefix))throw new Error('报告证据引用格式不完整');await emit(pending);pending='';}for(const line of raw.split('\n')){const quoted=line.match(/^\s*>\s*(.*)$/);if(quoted&&quoted[1].trim()&&!/^(?:\[\[evidence:E\d+\]\]\s*)+$/.test(quoted[1].trim()))throw new Error('报告含模型自行编写的引文，请使用证据编号');}}
 };
}
