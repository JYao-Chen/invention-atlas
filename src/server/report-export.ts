import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import type {Run,AnalysisResult} from '../lib/types';
import {partitionRows} from '../lib/result-tables';
import {reportMarkdownHtml} from './report-markdown';

const escape=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
type Assets={js:string;css:string};
let assets:Assets|undefined;
function runtimeAssets(){return assets||= {js:readFileSync(resolve('public/report-export/runtime.js'),'utf8'),css:readFileSync(resolve('public/report-export/runtime.css'),'utf8')};}
function fallbackResult(result:AnalysisResult){
 const tables=partitionRows(result.rows).map(group=>`<div class="table-scroll"><table><thead><tr>${group.keys.map(key=>`<th>${escape(key)}</th>`).join('')}</tr></thead><tbody>${group.rows.map(row=>`<tr>${group.keys.map(key=>`<td>${escape(typeof row[key]==='object'?JSON.stringify(row[key]):row[key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`).join('');
 return `<section class="result-panel"><h2>${escape(result.title)}</h2><p>${escape(result.summary)}</p><div class="markdown result-method">${reportMarkdownHtml(result.method)}</div>${tables}</section>`;
}
export function exportReportHtml(report:{title:string;run:Run},suppliedAssets?:Assets){
 const runtime=suppliedAssets||runtimeAssets(),used=new Set<string>();
 const narrative=report.run.answer.split(/(\[\[chart:[a-zA-Z0-9-]+\]\])/g).map(part=>{
  const id=part.match(/^\[\[chart:([^\]]+)\]\]$/)?.[1];
  if(!id)return `<div class="markdown">${reportMarkdownHtml(part)}</div>`;
  const result=report.run.results.find(r=>r.id===id);if(!result||used.has(id))return '';used.add(id);return fallbackResult(result);
 }).join('');
 const rest=report.run.results.filter(r=>!used.has(r.id)).map(fallbackResult).join('');
 const json=JSON.stringify(report).replace(/</g,'\\u003c');
 return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(report.title)}</title><style>${runtime.css}</style></head><body><main id="report-root" class="export-document"><header class="export-heading"><h1>${escape(report.title)}</h1><p>数据集 ${escape(report.run.datasetId)} · ${escape(report.run.createdAt)} · 保存时的分析结果</p></header>${narrative}${rest}<noscript><p>启用JavaScript可查看交互图表；公式与完整结果表已保留。</p></noscript></main><script id="report-data" type="application/json">${json}</script><script>${runtime.js.replace(/<\/script/gi,'<\\/script')}</script></body></html>`;
}
