import {z} from 'zod';
import type {Patent,Params,AnalysisResult,EntityRule,ResearchAudit,Run} from '@/lib/types';
export const entityRulesSchema=z.array(z.object({alias:z.string().trim().min(1),canonical:z.string().trim().min(1),basis:z.string().trim().min(1)})).max(2000).superRefine((rules,ctx)=>{const names=new Set<string>();for(const r of rules){if(names.has(r.alias))ctx.addIssue({code:'custom',message:'同一个别名只能有一条规则：'+r.alias});names.add(r.alias);}for(const r of rules)if(rules.some(other=>other.alias===r.canonical&&other.canonical!==r.canonical))ctx.addIssue({code:'custom',message:'请直接指向最终名称，不使用链式归并：'+r.alias});});
export function governedRecords(records:Patent[],rules:EntityRule[],counting:Params['counting']='publication'){
 const names=new Map(rules.map(r=>[r.alias,r.canonical]));const normalized=records.map(p=>({...p,applicants:[...new Set(p.applicants.map(n=>names.get(n)||n))]}));
 if(counting!=='family')return {records:normalized,unknown:0};
 // Missing family identifiers stay as individual documents, never one shared "unknown family".
 const seen=new Set<string>();const sorted=normalized.slice().sort((a,b)=>(a.publicationDate||'9999').localeCompare(b.publicationDate||'9999')||a.id.localeCompare(b.id));
 return {records:sorted.filter(p=>{const key=p.familyId?'family:'+p.familyId:'publication:'+p.id;if(seen.has(key))return false;seen.add(key);return true;}),unknown:normalized.filter(p=>!p.familyId).length};
}
export function selectedRecords(records:Patent[],ids:string[]){const set=new Set(ids);return records.filter(p=>set.has(p.id));}
export function searchIds(results:AnalysisResult[]){return [...new Set(results.filter(r=>r.tool==='search_patents'&&r.status==='completed').flatMap(r=>r.rows.map(row=>String(row.patent))))];}
export function auditExecution(plan:Run['plan'],results:AnalysisResult[]):ResearchAudit{const params=(p:Params)=>JSON.stringify(Object.entries(p).sort(([a],[b])=>a.localeCompare(b)));return plan.map(step=>{const result=results.find(r=>r.tool===step.tool&&params(r.params)===params(step.params));return {tool:step.tool,status:result?.status||'missing',reason:result?.summary||'计划中的工具未执行'};});}
export function datasetAudit(records:Iterable<Patent>){
 const ids=new Set<string>(),rows:Record<string,unknown>[]=[];
 for(const p of records){if(ids.has(p.id))rows.push({patent:p.id,issue:'重复公开编号',field:'id'});ids.add(p.id);
  for(const key of ['title','abstract','applicants','publicationDate','ipc','claims','description','citations','familyId','familyMembers','legalStatus','legalAsOf'] as const){const v=p[key];if(!v||Array.isArray(v)&&!v.length)rows.push({patent:p.id,issue:'缺失字段',field:key});}
  if(p.publicationDate){const date=new Date(p.publicationDate+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(p.publicationDate)||!Number.isFinite(date.valueOf())||date.toISOString().slice(0,10)!==p.publicationDate)rows.push({patent:p.id,issue:'日期格式异常',field:'publicationDate'});}
  for(const c of p.claims)if(c.sourceStart!==undefined&&p.rawText.slice(c.sourceStart,c.sourceEnd).trim()!==c.text)rows.push({patent:p.id,issue:'原文定位不一致',field:'claims',claim:c.number});
 }
 return rows;
}
