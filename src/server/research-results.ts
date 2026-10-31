import type {AnalysisResult} from '../lib/types';
import {readResult} from './result-contract';

// Keep the model's navigation context small; complete rows remain in storage
// and can be requested through read_result or read_patent.
export function researchResultPage(result:AnalysisResult,input:Parameters<typeof readResult>[1]={}){
 const page=readResult(result,input);
 return {...page,method:result.method,...(input.patent?{matchedPatent:input.patent}:{}),...('scope' in page?{scope:result.scope?{...result.scope,patentCount:result.scope.patentIds.length,patentIds:result.scope.patentIds.slice(0,20),omittedPatentIds:Math.max(0,result.scope.patentIds.length-20)}:undefined}:{}),...('rowSources' in page?{rowSources:page.rowSources?.map(s=>({...s,patentCount:s.patentIds.length,patentIds:s.patentIds.slice(0,20),omittedPatentIds:Math.max(0,s.patentIds.length-20)}))}:{})};
}
export function researchResultPreview(result:AnalysisResult){
 const page=researchResultPage(result,{limit:20});
 const previewOmissions:{path:string;total:number;included:number}[]=[];
 const compact=(value:unknown,path=''):unknown=>{
  if(typeof value==='string'&&value.length>2000)return value.slice(0,2000)+' [预览截断，完整行使用read_result读取]';
  if(Array.isArray(value)){if(value.length>20)previewOmissions.push({path,total:value.length,included:20});return value.slice(0,20).map((v,i)=>compact(v,path+'/'+i));}
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,compact(v,path+'/'+key)]));
  return value;
 };
 return {...compact(page) as object,previewOmissions,title:result.title,summary:result.summary,method:result.method,rowCount:result.rows.length,graph:result.graph?{nodeCount:result.graph.nodes.length,edgeCount:result.graph.edges.length}:undefined,note:'这是前20行预览，完整表、图节点和连边通过read_result分页读取。'};
}
