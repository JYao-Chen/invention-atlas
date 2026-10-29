import {z} from 'zod';
import {TOOL_DEFS} from '../lib/tool-definitions';

export const TEST_SET_DISCIPLINE='测试集只用于最终报告；不得根据测试集结果调整 Planner prompt、规则或开发集。';
export const TOOL_SELECTION_SEED=20261029;
export function toolSelectionSplit(ids:string[],seed=TOOL_SELECTION_SEED){
 const shuffled=[...ids].sort();let state=seed>>>0;
 for(let i=shuffled.length-1;i>0;i--){state=(Math.imul(state,1664525)+1013904223)>>>0;const j=state%(i+1);[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
 const dev=new Set(shuffled.slice(0,Math.round(shuffled.length*2/3)));return new Map(ids.map(id=>[id,dev.has(id)?'dev' as const:'test' as const]));
}
const caseSchema=z.object({id:z.string().min(1),question:z.string().trim().min(1),expectedTools:z.array(z.enum(TOOL_DEFS.map(d=>d[0]) as [string,...string[]])).min(1),split:z.enum(['dev','test'])}).strict();
export const toolSelectionDatasetSchema=z.object({seed:z.literal(TOOL_SELECTION_SEED),discipline:z.literal(TEST_SET_DISCIPLINE),cases:z.array(caseSchema).min(1)}).strict().superRefine((data,ctx)=>{
 if(new Set(data.cases.map(c=>c.id)).size!==data.cases.length)ctx.addIssue({code:'custom',message:'重复问题ID'});
 const split=toolSelectionSplit(data.cases.map(c=>c.id),data.seed);
 for(const [index,c] of data.cases.entries()){
  if(split.get(c.id)!==c.split)ctx.addIssue({code:'custom',path:['cases',index,'split'],message:'划分与固定种子不一致'});
  if(new Set(c.expectedTools).size!==c.expectedTools.length)ctx.addIssue({code:'custom',path:['cases',index,'expectedTools'],message:'期望工具重复'});
 }
});
export type ToolSelectionCase=z.infer<typeof caseSchema>;
export function toolSelectionMetrics(actual:string[],expected:string[]){
 const predicted=new Set(actual),target=new Set(expected),correct=[...predicted].filter(t=>target.has(t)).length;
 return {precision:predicted.size?correct/predicted.size:target.size?0:1,recall:target.size?correct/target.size:1,exactMatch:predicted.size===target.size&&correct===target.size?1:0};
}
export async function evaluateToolSelection(cases:ToolSelectionCase[],planner:(question:string)=>Promise<string[]>){
 const rows:(ToolSelectionCase&{actual:string[]}&ReturnType<typeof toolSelectionMetrics>)[]=[];
 for(const item of cases){const actual=[...new Set(await planner(item.question))];rows.push({...item,actual,...toolSelectionMetrics(actual,item.expectedTools)});}
 const mean=(key:'precision'|'recall'|'exactMatch')=>rows.length?rows.reduce((sum,row)=>sum+row[key],0)/rows.length:null;
 return {discipline:TEST_SET_DISCIPLINE,rows,macro:{count:rows.length,precision:mean('precision'),recall:mean('recall'),exactMatch:mean('exactMatch')}};
}
