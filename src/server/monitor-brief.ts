import type {Row} from '../lib/types';
export type MonitorFieldChange={field:string;before:unknown;after:unknown};

export type MonitorBrief={
 baselineInitialized:boolean;
 counts:{baseline:number;added:number;removed:number;updated:number};
 events:{patent:string;change:string;fields:string[];sourceUrl:string;sourceName:string;changes?:MonitorFieldChange[]}[];
 interpretation:string;
};
export function monitorBrief(rows:Row[],baselineInitialized:boolean,records:{id:string;sourceUrl?:string;sourceName?:string}[]):MonitorBrief{
 const byId=new Map(records.map(record=>[record.id,record]));
 const counts={baseline:0,added:0,removed:0,updated:0};
 const kinds:Record<string,keyof typeof counts>={'基线收录':'baseline','新增':'added','移出返回集':'removed','记录变化':'updated'};
 const events=rows.map(row=>{
  const change=String(row.change),kind=kinds[change];
  if(!kind)throw new Error('未知监测事件类型：'+change);
  counts[kind]++;
  const patent=String(row.patent),record=byId.get(patent);
  if(!record)throw new Error('监测事件缺少对应基线或当前记录：'+patent);
  const changes=Array.isArray(row.field_changes)?structuredClone(row.field_changes) as MonitorFieldChange[]:undefined;
  return {patent,change,fields:Array.isArray(row.changed_fields)?row.changed_fields.map(String):[],sourceUrl:record.sourceUrl||'',sourceName:record.sourceName||'',...(changes?{changes}:{})};
 });
 return {baselineInitialized,counts,events,interpretation:baselineInitialized?
  '本次建立入库检索返回集基线，收录记录不表示新公开专利。':
  '比较同一策略和范围的入库检索返回集。新增与移出可能来自导入、删除、字段更新或排名变化；记录变化仅证明保存字段不同，不表示官方更正或权利失效。'};
}
