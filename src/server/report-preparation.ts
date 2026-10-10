import type {Run,Patent} from '../lib/types';

export const REPORT_WRITING_GUIDANCE='围绕用户的研究问题撰写分析报告，而不是按工具调用顺序罗列结果。开头给出具体标题和有证据支持的主要发现；随后按问题涉及的时间变化、技术结构、竞争格局或专利特征组织完整段落。每个分析段落说明统计观察、比较依据及对应专利证据，引用真实结果图表。需要解释技术内容时使用已提供的原文片段，区分观察与解释；只有统计结果时不要补造技术机制。最后回答研究问题，给出由证据支持的后续分析方向。简单问题保持简洁，不强行增加无关章节；综合问题充分比较已有维度，不只复述排名。对失败、空范围、缺字段与预览省略分别说明，不能混淆。撰写期间不改变统计口径或研究范围。';

export function prepareReport(run:Run,records:Patent[]){
 const ids=new Set(run.scope?.patentIds||records.map(p=>p.id));
 const selected=records.filter(p=>ids.has(p.id));
 const years=new Map<string,number>();
 for(const p of selected){const year=p.publicationDate.slice(0,4);if(/^\d{4}$/.test(year))years.set(year,(years.get(year)||0)+1);}
 const tools=run.results.map(r=>({id:r.id,tool:r.tool,title:r.title,status:r.status,params:r.params,inputCount:r.scope?.inputCount,analyzedCount:r.scope?.analyzedCount,counting:r.scope?.counting,rowCount:r.rows.length,linkedRows:r.rowSources?.length||0,representatives:[...new Set((r.rowSources||[]).flatMap(s=>s.representatives.map(p=>p.patent)))].length,warnings:r.warnings,method:r.method}));
 const charts=run.results.filter(r=>r.status==='completed'&&(r.chart||r.graph||r.clusterMap||r.rows.some(row=>typeof row.word==='string'))).map(r=>({id:r.id,title:r.title,views:[...(r.chart?[r.chart.kind]:[]),...(r.graph?['network']:[]),...(r.clusterMap?['cluster']:[]),...(r.rows.some(row=>typeof row.word==='string')?['wordcloud']:[])],reference:'[[chart:'+r.id+']]'}));
 return {scopePublications:selected.length,publicationYears:[...years].sort(([a],[b])=>a.localeCompare(b)).map(([year,count])=>({year,count})),scopeNote:'范围概况按公开记录计算；分析指标使用各工具自己的筛选条件、计数口径及实际分析数，不以范围概况替代工具统计。',tools,charts,completed:tools.filter(t=>t.status==='completed').length,limited:tools.filter(t=>t.status!=='completed').length,missing:run.audit?.filter(a=>a.status==='missing').map(a=>a.tool)||[]};
}
