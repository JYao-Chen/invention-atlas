import type {Patent,Row} from '@/lib/types';
import {store} from './db';
import {chat,jsonResponse} from './model';
import {modelConfig} from './config';
import {claimStructure,splitClaimText} from '../lib/claim-structure';
export function claimEvidenceSpans(text:string){
 const spans:{start:number;end:number;text:string}[]=[];
 for(const clause of text.matchAll(/[^,;:\n]*[,;:\n]+|[^,;:\n]+$/g)){
  for(let start=0;start<clause[0].length;){let end=Math.min(start+400,clause[0].length);if(end<clause[0].length){const gap=clause[0].slice(start,end).search(/\s+\S*$/);if(gap>0)end=start+gap+1;}spans.push({start:clause.index!+start,end:clause.index!+end,text:clause[0].slice(start,end)});start=end;}
 }
 return spans;
}
export async function extractClaimElements(datasetId:string,records:Patent[],claimNumbers?:number[],signal?:AbortSignal,progress?:(done:number,total:number,label:string)=>void,request:typeof chat=chat){
 const structures=new Map(records.map(p=>[p.id,claimStructure(p.claims)]));
 const work=records.flatMap(p=>p.claims.flatMap(splitClaimText).filter(c=>!claimNumbers||claimNumbers.includes(c.number)).flatMap(c=>{const chunks=[];for(let start=0;start<c.text.length;start+=15000)chunks.push({p,c,start,text:c.text.slice(start,start+16000)});return chunks;})),method='claim-evidence-v4-clauses:'+modelConfig().model;
 if(!work.length)throw new Error('指定范围没有可用权利要求');const rows:Row[]=[],seen=new Set<string>();let done=0;
 progress?.(0,work.length,'权利要求分段');
 for(const {p,c,start,text} of work){signal?.throwIfAborted();const cached=await store.claimCheckpoint(datasetId,p.id,method,c.number,start);
  let extracted:Row[];
  if(cached)extracted=cached;else{
   const spans=claimEvidenceSpans(text);
   let error='';extracted=[];for(let attempt=0;attempt<2;attempt++){try{
    const data=jsonResponse<{elements:{element:string;role:string;evidence_start:number;evidence_end:number}[]}>(await request('完整拆解这段权利要求的技术要素，不限要素数量。只输出JSON {"elements":[{"element":"中文技术要素","role":"部件/步骤/约束/关联关系","evidence_start":起始片段编号,"evidence_end":结束片段编号}]}。选能支撑该要素的最短连续原文片段。不要法律解释、不要添加说明书之外的功能。返回elements数组，即使为空。'+error,spans.map((s,i)=>`[${i+1}] ${s.text}`).join('\n'),{json:true,signal}));
    if(!Array.isArray(data.elements))throw new Error('缺少elements数组');
    extracted=data.elements.map(e=>{if(!e.element?.trim()||!Number.isInteger(e.evidence_start)||!Number.isInteger(e.evidence_end)||e.evidence_start<1||e.evidence_end<e.evidence_start||e.evidence_end>spans.length)throw new Error('要素字段或证据编号错误');const offset=start+spans[e.evidence_start-1].start,quote=text.slice(spans[e.evidence_start-1].start,spans[e.evidence_end-1].end),node=structures.get(p.id)!.nodes.find(node=>node.number===c.number);return {patent:p.id,claim:c.number,element:e.element,role:e.role,quote,claim_offset:offset,source_claim:c.sourceClaimNumber,source_claim_offset:c.sourceClaimOffset+offset,source_offset:c.sourceStart===undefined?null:c.sourceStart+offset,depends_on:node?.dependsOn||[],claim_structure_status:node?.status||'unresolved',source:p.sourceUrl};});break;
   }catch(e){signal?.throwIfAborted();if(attempt===1)throw new Error(`${p.id} 权利要求${c.number}：${(e as Error).message}；已完成分段保留，下次可续跑`);error='上次输出校验失败，请修正：'+(e as Error).message;}}
   await store.saveClaimCheckpoint(datasetId,p.id,method,c.number,start,extracted);
  }
  for(const row of extracted){const key=p.id+':'+c.number+':'+row.claim_offset+':'+row.element;if(!seen.has(key)){seen.add(key);rows.push(row);}}
  progress?.(++done,work.length,`权利要求分段${cached?'（复用断点）':''}`);
 }return rows;
}
