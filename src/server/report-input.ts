import type {AnalysisResult,Dataset} from '@/lib/types';

export function reportDataset(dataset:Dataset|undefined){
 return dataset?{...dataset,coveragePercent:Object.fromEntries(Object.entries(dataset.coverage).map(([field,value])=>[field,Number((value*100).toFixed(4))])),coverageUnit:'coverage是0至1的比例；coveragePercent才是百分数，例如coverage=0.008对应0.8%，不是0.008%。'}:undefined;
}

// Sampling is presentation-only: saved tool rows and charts remain complete.
export function reportResult(result:AnalysisResult){
 const groups=new Map<string,typeof result.rows>();
 for(const row of result.rows){
  const key=JSON.stringify([row.year??row.period??null,row.type??row.metric??row.issue??null,row.field??null,row.status??row.change??row.code??null,result.tool==='analyze_competitor_evolution'?row.applicant??null:null]);
  const group=groups.get(key)||[];group.push(row);groups.set(key,group);
 }
 const limit=Math.max(120,groups.size*3);
 const selected:typeof result.rows=[];
 for(let index=0;selected.length<Math.min(limit,result.rows.length);index++){
  for(const rows of groups.values())if(rows[index]&&selected.length<limit)selected.push(rows[index]);
 }
 const shortenedTextPaths:string[]=[];
 const compact=(value:unknown,path:string):unknown=>{
  if(typeof value==='string'&&value.length>2000){shortenedTextPaths.push(path);return value.slice(0,2000)+'\n[文本预览省略后续内容；完整原文保留在工具结果中]';}
  if(Array.isArray(value))return value.map((v,i)=>compact(v,`${path}/${i}`));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,compact(v,`${path}/${key}`)]));
  return value;
 };
 const rows=compact(selected.map(row=>typeof row.coverage==='number'?{...row,coveragePercent:Number((row.coverage*100).toFixed(4))}:row),'rows');
 return {id:result.id,tool:result.tool,title:result.title,status:result.status,params:result.params,summary:result.summary,method:result.method,warnings:result.warnings,rows,rowCount:result.rows.length,
  presentation:{includedRows:selected.length,omittedRows:result.rows.length-selected.length,complete:result.rows.length===selected.length,groups:[...groups.entries()].map(([key,values])=>({key,totalRows:values.length,includedRows:selected.filter(row=>values.includes(row)).length})),shortenedTextPaths,note:'rows是报告展示输入，不代表完整工具结果；省略不等于数据缺失，完整结果可在嵌入图表和数据表查看。'},
  graph:result.graph?{nodes:result.graph.nodes.length,edges:result.graph.edges.length}:undefined};
}
