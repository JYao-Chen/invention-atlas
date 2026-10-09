import type {Row} from './types';

export function plottedRows(rows:Row[],chart:{kind:'bar'|'line';x:string;y:string}){
 return chart.kind==='line'?rows.filter(row=>row[chart.x]!==undefined&&typeof row[chart.y]==='number'):rows.slice(0,20);
}

export function partitionRows(rows:Row[]){
 const groups:{keys:string[];rows:Row[];type?:string}[]=[];
 for(const row of rows){
  const keys=Object.keys(row),type=typeof row.type==='string'?row.type:undefined;
  const group=groups.find(g=>g.type===type&&g.keys.length===keys.length&&g.keys.every(key=>keys.includes(key)));
  if(group)group.rows.push(row);else groups.push({keys,rows:[row],type});
 }
 return groups;
}

export function coveragePercent(value:unknown){
 return typeof value==='number'&&Number.isFinite(value)?(value*100).toLocaleString('zh-CN',{maximumFractionDigits:2})+'%':'—';
}

export function tableHeading(keys:string[],type?:string){
 if(type==='fit_diagnostics')return '拟合诊断';
 if(type==='bibliographic_coupling')return '文献耦合';
 if(type==='co_citation')return '共引关系';
 if(type)return type;
 if(keys.includes('metric'))return '引证数量';
 if(keys.includes('pagerank'))return '专利引证指标';
 if(keys.includes('family_office'))return '同族公开局';
 if(keys.includes('member'))return '同族成员';
 if(keys.includes('event_date'))return '来源事件';
 if(keys.includes('as_of'))return '来源状态记录';
 if(keys.includes('status')&&keys.includes('count'))return '状态分布';
 if(keys.includes('year'))return '年度数据';
 if(keys.includes('internal_citations'))return '引证指标筛查';
 return '数据明细';
}
