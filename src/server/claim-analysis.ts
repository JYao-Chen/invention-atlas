import type {Patent,Row} from '@/lib/types';
import {db} from './db';
import {chat,jsonResponse} from './model';
import {modelConfig} from './config';
export async function extractClaimElements(datasetId:string,records:Patent[],claimNumbers?:number[],signal?:AbortSignal,progress?:(done:number,total:number,label:string)=>void,request:typeof chat=chat){
 db.exec('CREATE TABLE IF NOT EXISTS claim_checkpoints(dataset_id TEXT,patent_id TEXT,method TEXT,claim_number INTEGER,chunk_start INTEGER,payload TEXT,PRIMARY KEY(dataset_id,patent_id,method,claim_number,chunk_start))');
 const work=records.flatMap(p=>p.claims.filter(c=>!claimNumbers||claimNumbers.includes(c.number)).flatMap(c=>{const chunks=[];for(let start=0;start<c.text.length;start+=15000)chunks.push({p,c,start,text:c.text.slice(start,start+16000)});return chunks;})),method='claim-evidence-v2:'+modelConfig().model;
 if(!work.length)throw new Error('指定范围没有可用权利要求');const rows:Row[]=[],seen=new Set<string>();let done=0;
 progress?.(0,work.length,'权利要求分段');
 for(const {p,c,start,text} of work){signal?.throwIfAborted();const cached=db.prepare('SELECT payload FROM claim_checkpoints WHERE dataset_id=? AND patent_id=? AND method=? AND claim_number=? AND chunk_start=?').get(datasetId,p.id,method,c.number,start) as {payload:string}|undefined;
  let extracted:Row[];
  if(cached)extracted=JSON.parse(cached.payload);else{
   const spans=[...text.matchAll(/[^\n]+(?:\n|$)/g)].flatMap(m=>{const spans=[];for(let i=0;i<m[0].length;i+=400)spans.push({start:m.index!+i,end:m.index!+Math.min(i+400,m[0].length),text:m[0].slice(i,i+400)});return spans;});
   let error='';extracted=[];for(let attempt=0;attempt<2;attempt++){try{
    const data=jsonResponse<{elements:{element:string;role:string;evidence_start:number;evidence_end:number}[]}>(await request('完整拆解这段权利要求的技术要素，不限要素数量。只输出JSON {"elements":[{"element":"中文技术要素","role":"部件/步骤/约束/关联关系","evidence_start":起始片段编号,"evidence_end":结束片段编号}]}。选能支撑该要素的最短连续原文片段。不要法律解释、不要添加说明书之外的功能。返回elements数组，即使为空。'+error,spans.map((s,i)=>`[${i+1}] ${s.text}`).join('\n'),{json:true,signal}));
    if(!Array.isArray(data.elements))throw new Error('缺少elements数组');
    extracted=data.elements.map(e=>{if(!e.element?.trim()||!Number.isInteger(e.evidence_start)||!Number.isInteger(e.evidence_end)||e.evidence_start<1||e.evidence_end<e.evidence_start||e.evidence_end>spans.length)throw new Error('要素字段或证据编号错误');const offset=start+spans[e.evidence_start-1].start,quote=text.slice(spans[e.evidence_start-1].start,spans[e.evidence_end-1].end);return {patent:p.id,claim:c.number,element:e.element,role:e.role,quote,claim_offset:offset,depends_on:c.dependsOn||[],source:p.sourceUrl};});break;
   }catch(e){signal?.throwIfAborted();if(attempt===1)throw new Error(`${p.id} 权利要求${c.number}：${(e as Error).message}；已完成分段保留，下次可续跑`);error='上次输出校验失败，请修正：'+(e as Error).message;}}
   db.prepare('INSERT OR REPLACE INTO claim_checkpoints VALUES(?,?,?,?,?,?)').run(datasetId,p.id,method,c.number,start,JSON.stringify(extracted));
  }
  for(const row of extracted){const key=p.id+':'+c.number+':'+row.claim_offset+':'+row.element;if(!seen.has(key)){seen.add(key);rows.push(row);}}
  progress?.(++done,work.length,`权利要求分段${cached?'（复用断点）':''}`);
 }return rows;
}
