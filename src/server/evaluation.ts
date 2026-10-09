import {z} from 'zod';
import {fullPatent} from './db';
import type {Run,Patent} from '@/lib/types';
export const judgmentSchema=z.object({runId:z.string().min(1),reviewer:z.string().trim().min(1),basis:z.string().trim().min(1),relevant:z.array(z.string()),irrelevant:z.array(z.string()),extraction:z.array(z.object({resultId:z.string(),row:z.number().int().min(0),correct:z.boolean(),note:z.string()})),report:z.enum(['accepted','needs_revision','not_reviewed']),reportNote:z.string()}).superRefine((v,ctx)=>{if(new Set(v.relevant).size!==v.relevant.length||new Set(v.irrelevant).size!==v.irrelevant.length||v.relevant.some(id=>v.irrelevant.includes(id)))ctx.addIssue({code:'custom',message:'相关与不相关编号不得重复或冲突'});if(new Set(v.extraction.map(e=>e.resultId+':'+e.row)).size!==v.extraction.length)ctx.addIssue({code:'custom',message:'同一结果行不能重复评审'});});
export type Judgment=z.infer<typeof judgmentSchema>;
export function evaluateRun(run:Run,records:Patent[],judgment?:Judgment){
 const ids=[...new Set(run.results.filter(r=>r.tool==='search_patents').flatMap(r=>r.rows.map(row=>String(row.patent))))];
 const rows=run.results.flatMap(r=>r.rows.map((row,index)=>({resultId:r.id,index,row})));
 const evidence=rows.filter(({row})=>typeof row.quote==='string'&&typeof row.patent==='string');let locatable=0;
 for(const {row} of evidence){const projected=records.find(p=>p.id===row.patent);const p=projected?fullPatent(run.datasetId,projected):undefined;const claim=p?.claims.find(c=>c.number===row.claim);if(claim?.text.includes(row.quote as string)||p&&[p.abstract,p.description].some(text=>text.includes(row.quote as string)))locatable++;}
 const markers=[...run.answer.matchAll(/\[\[chart:([^\]]+)\]\]/g)].map(m=>m[1]);
 const automatic={sourceQuoteCount:evidence.length,locatableQuotes:locatable,unresolvedChartReferences:markers.filter(id=>!run.results.some(r=>r.id===id)),failedTools:run.results.filter(r=>r.status!=='completed').map(r=>r.tool),unexecutedTools:run.plan.filter(s=>!run.results.some(r=>r.tool===s.tool)).map(s=>s.tool)};
 if(!judgment)return {automatic,human:{status:'pending',precision:null,recallWithinJudgedPool:null,extractionAccuracy:null,report:'not_reviewed'}};
 for(const id of [...judgment.relevant,...judgment.irrelevant])if(!records.some(p=>p.id===id))throw new Error('评审编号不在数据集中：'+id);
 for(const e of judgment.extraction)if(!rows.some(row=>row.resultId===e.resultId&&row.index===e.row))throw new Error('评审结果行不存在');
 const positive=new Set(judgment.relevant),negative=new Set(judgment.irrelevant),judged=ids.filter(id=>positive.has(id)||negative.has(id)),tp=judged.filter(id=>positive.has(id)).length;
 return {automatic,human:{status:judged.length||judgment.extraction.length||judgment.report!=='not_reviewed'?'reviewed':'pending',reviewer:judgment.reviewer,basis:judgment.basis,returned:ids.length,judgedReturned:judged.length,unjudgedReturned:ids.length-judged.length,precision:judged.length?tp/judged.length:null,recallWithinJudgedPool:positive.size?tp/positive.size:null,recallLimitation:'只相对人工标注的相关记录池，不是全球查全率；未标注记录不算错误。',extractionReviewed:judgment.extraction.length,extractionAccuracy:judgment.extraction.length?judgment.extraction.filter(e=>e.correct).length/judgment.extraction.length:null,report:judgment.report,reportNote:judgment.reportNote}};
}
