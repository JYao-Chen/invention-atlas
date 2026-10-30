import type {AnalysisResult,ReportAuditIssue,Dataset} from '../lib/types';
import {resultPatentNumbers,patentNumberPattern as patentPattern} from './report-conclusions';

const numberPattern=/-?\d+(?:,\d{3})*(?:\.\d+)?(?:[eE][+-]?\d+)?(?:%|％)?/g;
const numericValue=(value:string)=>Number(value.replace(/[,％%]/g,''))/(value.endsWith('%')||value.endsWith('％')?100:1);
function hasRoundedEvidence(value:string,sorted:number[]){
 const [mantissa,exponent='0']=value.replace(/[,％%]/g,'').toLowerCase().split('e'),decimals=mantissa.split('.')[1]?.length||0;
 const coefficient=BigInt(mantissa.replace('.',''))*10n,power=Number(exponent)-decimals-(/[%％]$/.test(value)?2:0)-1;
 // Construct decimal half-unit boundaries before converting to Number: direct
 // subtraction (3.14 - 0.005) would incorrectly exclude evidence equal to 3.135.
 const lower=Number(`${coefficient-5n}e${power}`),upper=Number(`${coefficient+5n}e${power}`);
 let left=0,right=sorted.length;
 while(left<right){const middle=Math.floor((left+right)/2);if(sorted[middle]<lower)left=middle+1;else right=middle;}
 return left<sorted.length&&sorted[left]<upper;
}
export function auditReport(answer:string,results:AnalysisResult[],dataset?:Pick<Dataset,'count'|'coverage'|'years'>):ReportAuditIssue[]{
 const patents=new Set(results.flatMap(r=>[...resultPatentNumbers(r)])),numbers=new Set<number>();
 const collect=(value:unknown)=>{
  if(typeof value==='number'&&Number.isFinite(value))numbers.add(value);
  else if(typeof value==='string')for(const match of value.replace(patentPattern,'').matchAll(numberPattern))numbers.add(numericValue(match[0]));
  else if(Array.isArray(value))value.forEach(collect);
  else if(value&&typeof value==='object')Object.values(value).forEach(collect);
 };
 // Parameters are requests, not observed numerical evidence. Result IDs, source
 // URLs and timestamps are also excluded from the numeric evidence pool.
 for(const r of results.filter(r=>r.status==='completed'))collect({rows:r.rows,summary:r.summary,rowSources:r.rowSources,graph:r.graph,clusterMap:r.clusterMap,scope:r.scope,layoutMatrix:r.layoutMatrix,method:r.method});
 if(dataset)collect({count:dataset.count,coverage:dataset.coverage,years:dataset.years});
 const sortedNumbers=[...numbers].sort((a,b)=>a-b);
 const issues:ReportAuditIssue[]=[];
 for(const [index,paragraph] of answer.split(/\n\s*\n/).entries()){
  const text=paragraph.replace(/\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/https?:\/\/\S+/g,'');
  const withoutCharts=text.replace(/\[\[chart:[^\]]+\]\]/g,'');
  for(const value of new Set([...withoutCharts.matchAll(patentPattern)].map(m=>m[0].toUpperCase())))if(!patents.has(value))issues.push({kind:'patent',value,paragraph:index+1,reason:'公开编号未在工具结果证据中找到'});
  for(const match of text.matchAll(/\[\[chart:([^\]]+)\]\]/g))if(!results.some(r=>r.id===match[1]))issues.push({kind:'chart',value:match[1],paragraph:index+1,reason:'图表结果编号未在运行中找到'});
  const prose=withoutCharts.replace(patentPattern,'').replace(/^\s*(?:#{1,6}\s+)?\d+[.)、]\s*/gm,'');
  for(const value of new Set([...prose.matchAll(numberPattern)].map(m=>m[0])))if(!numbers.has(numericValue(value))&&!hasRoundedEvidence(value,sortedNumbers))issues.push({kind:'number',value,paragraph:index+1,reason:'数值未在工具结果中找到；请核对原始值、单位及推算依据'});
 }
 return issues;
}
