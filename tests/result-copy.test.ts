import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {resultCopy,runCopy,resultText} from '../src/lib/result-copy';
import ResultView from '../src/components/ResultView';
import {exportReportHtml} from '../src/server/report-export';
import type {AnalysisResult,Run} from '../src/lib/types';
const disclaimer='抽样和缺失月份会影响趋势；不得解释为行业总量。';
const source:AnalysisResult={id:'saved-trend',tool:'analyze_patent_trend',title:'公开趋势',status:'completed',datasetId:'fixture',params:{},summary:'按公开日期统计 8 个时间点。',rows:[{period:'2025',count:3,quote:disclaimer}],method:'按公开日期统计',warnings:[disclaimer],evidence:[],createdAt:'2026-10-30'};
test('saved result preserves substantive scope without changing source evidence or mutating input',()=>{
 const cleaned=resultCopy(source);
 assert.deepEqual(cleaned.warnings,[disclaimer]);assert.equal(cleaned.rows,source.rows);assert.equal(cleaned.rows[0].quote,disclaimer);assert.deepEqual(source.warnings,[disclaimer]);
 const failed=resultCopy({...source,warnings:['主题命名未完成：连接中断；保留聚类与关键词，可重新运行。']});assert.equal(failed.warnings.length,1);
});
test('historical clustering titles and scope notes use the new copy immediately',()=>{
 const run={answer:'生成 6 个技术主题；标签需人工复核。',results:[source],scope:{notes:['按检索Top-K候选并集分析，不是行业全集；语义相关性需复核。'],selections:[],patentIds:[],mode:'search'}} as unknown as Run;
 const cleaned=runCopy(run);assert.equal(cleaned.answer,'生成 6 个技术主题。');assert.deepEqual(cleaned.scope?.notes,['按检索Top-K候选并集分析，不是行业全集；语义相关性需复核。']);assert.deepEqual(cleaned.results[0].warnings,[disclaimer]);
});
test('history views and interactive exports preserve substantive qualifications',()=>{
 const result={...source,rows:[{period:'2025',count:3}]};
 const html=renderToStaticMarkup(createElement(ResultView,{result,onPatent:()=>{}}));assert.ok(html.includes(disclaimer));assert.ok(html.includes('8 个时间点'));
 const run:Run={id:'run',conversationId:'fixture',datasetId:'fixture',question:'统计公开趋势',status:'completed',plan:[],error:'',model:'fixture',answer:'完成统计。',results:[result],createdAt:'2026-10-30'};
 const exported=exportReportHtml({title:'历史报告',run},{js:'',css:''});assert.ok(exported.includes(disclaimer));assert.ok(exported.includes('2025'));
});

test('generated boilerplate is removed while source quotes and code stay verbatim',()=>{
 const text='正文发现。\n本报告仅供参考，不构成法律意见。\n> '+disclaimer+'\n```text\n'+disclaimer+'\n```';
 const cleaned=resultText(text);assert.ok(cleaned.includes('正文发现。'));assert.ok(!cleaned.includes('本报告仅供参考'));assert.ok(cleaned.includes('> '+disclaimer));assert.ok(cleaned.includes('```text\n'+disclaimer+'\n```'));
});

test('historical method qualifications survive while automatic audit appendices disappear',()=>{
 const text='## 主要发现\n六个主题。\n## 方法与数据限制说明\n非随机抽样。\n### 字段覆盖率不足\n覆盖率说明。\n## 后续研究\n比较三个主题。\n## 自动审计待复核问题\n- number 1024 请核对。';
 assert.equal(resultText(text).replace(/\n+/g,'\n'),'## 主要发现\n六个主题。\n## 方法与数据限制说明\n非随机抽样。\n### 字段覆盖率不足\n覆盖率说明。\n## 后续研究\n比较三个主题。\n');
});

 test('scientific distinctions and mixed factual clauses survive display and export cleanup',()=>{
 const facts=[
  '专利原文声明，非独立实验验证。',
  '词项得分；不同方法不可跨尺度比较，YAKE越小越靠前',
  '主体份额平方和，0至1；非市场集中度',
  '缺失值不等于零；未检出不能说明技术不存在。',
  '拟合成功不证明行业成熟、衰退或未来增长。',
  '该关系来自专利文本声明，是否满足研发目标仍待验证。',
  '在本次检索范围内，这一变化可能与分类口径有关。',
 ];
 for(const fact of facts)assert.equal(resultText(fact),fact);
 assert.equal(resultText('2025年公开3件；仅供参考。'), '2025年公开3件；');
 assert.equal(resultText('## 免责声明\n采用公开件计数。\n本报告仅供参考。').trim(),'采用公开件计数。');
 const result=resultCopy({...source,summary:facts.join('\n'),method:facts[1]});
 assert.equal(result.summary,facts.join('\n'));assert.equal(result.method,facts[1]);
 const html=renderToStaticMarkup(createElement(ResultView,{result,onPatent:()=>{}}));
 assert.ok(html.includes('非独立实验验证'));assert.ok(html.includes('不同方法不可跨尺度比较'));
 });
