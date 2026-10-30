import type {Row} from '../lib/types';
export type LayoutMatrix={functions:string[];effects:string[];cells:{function:string;effect:string;documents:number;patentIds:string[];evidenceRows:number[]}[];missingPairs:{function:string;effect:string;status:'not_observed_in_sample'}[];missingPairCount:number;omittedMissingPairs:number;interpretation:string};
export function layoutMatrix(rows:Row[]):LayoutMatrix{
 const groups=new Map<string,{function:string;effect:string;patents:Set<string>;evidenceRows:number[]}>();
 rows.forEach((row,index)=>{if(typeof row.function!=='string'||typeof row.effect!=='string'||typeof row.patent!=='string'||typeof row.quote!=='string'||!row.quote.trim())throw new Error('布局矩阵需要可定位的技术效果证据行');const key=JSON.stringify([row.function,row.effect]);let group=groups.get(key);if(!group){group={function:row.function,effect:row.effect,patents:new Set(),evidenceRows:[]};groups.set(key,group);}group.patents.add(row.patent);group.evidenceRows.push(index);});
 const functions=[...new Set(rows.map(row=>String(row.function)))],effects=[...new Set(rows.map(row=>String(row.effect)))];
 const missingPairs:LayoutMatrix['missingPairs']=[],missingPairCount=functions.length*effects.length-groups.size;
 outer:for(const fn of functions)for(const effect of effects){if(!groups.has(JSON.stringify([fn,effect])))missingPairs.push({function:fn,effect,status:'not_observed_in_sample'});if(missingPairs.length>=120)break outer;}
 return {functions,effects,cells:[...groups.values()].map(group=>({function:group.function,effect:group.effect,documents:group.patents.size,patentIds:[...group.patents],evidenceRows:group.evidenceRows})),missingPairs,missingPairCount,omittedMissingPairs:missingPairCount-missingPairs.length,interpretation:'按原始标签精确分组，未归并同义词；计数为去重公开编号。functions、effects和非空cells完整保存，其他交叉组合均未观察；missingPairs只预览前120个，省略数量明确列出。未观察组合按本次抽取结果记录。'};
}
