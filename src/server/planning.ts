import {z} from 'zod';
import type {Params,Patent} from '@/lib/types';
import {questions} from '@/lib/suggestions';
import {TOOL_DEFS,paramsSchema} from './tools';
import {descriptionChars} from './db';

export function examplePatent(records:Patent[]){
 // Choose a complete, short document for the explicitly single-patent examples.
 return records.filter(p=>p.title&&p.abstract&&p.claims.length&&descriptionChars(p)).sort((a,b)=>(descriptionChars(a)+a.claims.reduce((n,c)=>n+c.text.length,0))-(descriptionChars(b)+b.claims.reduce((n,c)=>n+c.text.length,0))||a.id.localeCompare(b.id))[0];
}
export function toolDefaults(tool:string,records:Patent[]):Params{
 if(tool==='compare_claims'){const first=examplePatent(records);const second=examplePatent(records.filter(p=>p.id!==first?.id));return {patent_numbers:[first,second].filter((p):p is Patent=>Boolean(p)).map(p=>p.id),claim_numbers:[1]};}
 if(tool==='search_patents')return {query:'digital identity authentication',top_k:10};
 if(['read_patent_details','analyze_claim_elements','analyze_tech_matrix'].includes(tool)){const p=examplePatent(records);return {patent_numbers:p?[p.id]:[]};}
 if(tool==='monitor_patent_changes')return {query:'blockchain',strategy_id:'blockchain-monitor',top_k:20};
 if(tool==='audit_search_strategy')return {strategies:[{name:'blockchain',query:'blockchain'},{name:'identity',query:'blockchain identity authentication'}],top_k:20};
 if(tool==='analyze_clustering')return {k:6};
 return {};
}
export function recommendedTool(question:string){return Object.entries(questions).find(([,text])=>text===question.trim())?.[0];}
export function completeRecommendedStep(step:{tool:string;params?:Params},question:string,records:Patent[]){
 return {tool:step.tool,params:recommendedTool(question)===step.tool?toolDefaults(step.tool,records):step.params||{}};
}
export function requiredParameters(tool:string){
 if(tool==='search_patents')return ['query'];
 if(tool==='read_patent_details')return ['patent_numbers'];
 if(tool==='monitor_patent_changes')return ['query','strategy_id'];
 if(tool==='audit_search_strategy')return ['strategies'];
 if(tool==='compare_claims')return ['patent_numbers'];
 return [];
}
export const stepSchema=z.object({tool:z.enum(TOOL_DEFS.map(d=>d[0]) as [string,...string[]]),params:paramsSchema.default({})}).superRefine((step,ctx)=>{
 for(const key of requiredParameters(step.tool)){
  const value=step.params[key as keyof Params];
  if(value===undefined||typeof value==='string'&&!value.trim()||Array.isArray(value)&&!value.length)ctx.addIssue({code:z.ZodIssueCode.custom,path:['params',key],message:step.tool+' 必须提供 '+key});
 }
 if(step.params.strategies?.some(s=>!s.name.trim()||!s.query.trim()))ctx.addIssue({code:z.ZodIssueCode.custom,path:['params','strategies'],message:'策略名称和检索词不能为空'});
 if(step.tool==='compare_claims'&&new Set(step.params.patent_numbers).size<2)ctx.addIssue({code:'custom',path:['params','patent_numbers'],message:'对照至少需要两个不同编号'});
});
