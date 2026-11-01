import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {formatReportMarkdown,presentReport,reportChapterBody} from '../src/lib/report-template';
import {reportReading} from '../src/lib/report-reading';
import ReportReader from '../src/components/ReportReader';
import {exportReportHtml} from '../src/server/report-export';
import type {Run} from '../src/lib/types';
const text='# 身份认证研究\n\n## 摘要\n\n摘要 [1]。\n\n## 技术比较\n\n论证内容。\n\n### 实施条件\n\n在指定条件下成立。\n\n#### 原文证据\n\n保留引文 [1]。\n\n```txt\n## 原始代码\n```\n\n## 研发选择\n\n### 后续验证\n\n比较方案。\n\n## 资料来源\n\n1. [原文](https://example.org)';
test('templates produce stable chapter and subsection numbers without altering sources or code',()=>{
 const standard=formatReportMarkdown(text);
 assert.match(standard,/## 第1章　技术比较/);assert.match(standard,/### 1\.1　实施条件/);assert.match(standard,/#### 1\.1\.1　原文证据/);assert.match(standard,/## 第2章　研发选择/);assert.match(standard,/### 2\.1　后续验证/);
 assert.ok(standard.includes('## 摘要'));assert.ok(standard.includes('## 资料来源'));assert.ok(standard.includes('```txt\n## 原始代码\n```'));
 assert.equal(formatReportMarkdown(standard),standard);
 const academic=formatReportMarkdown(standard,'academic');assert.ok(academic.includes('## 1　技术比较'));assert.ok(!academic.includes('第1章'));
 assert.deepEqual(reportReading(academic).sources,reportReading(text).sources);
 assert.ok(formatReportMarkdown('## 主题\n### 证据','standard',4).includes('### 4.1　证据'));
});
test('reader offers templates and exports carry the chosen edition while saved prose stays intact',()=>{
 const run={answer:text,results:[],reportTemplate:'academic',datasetId:'fixture',createdAt:'2026-11-01'} as unknown as Run;
 const presented=presentReport({title:'研究',run});assert.equal(run.answer,text);assert.match(presented.run.answer,/## 1　技术比较/);
 const html=exportReportHtml({title:'研究',run},{js:'',css:''});assert.ok(html.includes('report-template-academic'));assert.ok(html.includes('1　技术比较'));assert.ok(!html.includes('第1章'));
 const reader=renderToStaticMarkup(createElement(ReportReader,{text,template:'brief',results:[],onPatent:()=>{},exportBase:'/api/reports/fixture/{format}?version=2'}));
 assert.ok(reader.includes('输出版式'));assert.ok(reader.includes('研究论文'));assert.ok(reader.includes('report-template-brief'));assert.ok(reader.includes('/api/reports/fixture/pdf?version=2&amp;template=brief'));assert.ok(reader.includes('report-citation'));
});

test('chapter preview and assembled prose share nested headings while fenced source text stays intact',()=>{
 const body='## 实施条件\n\n观察。\n\n```txt\n## 原始代码\n```';
 const normalized=reportChapterBody(body);
 assert.ok(normalized.startsWith('### 实施条件'));assert.ok(normalized.includes('```txt\n## 原始代码\n```'));
 assert.match(formatReportMarkdown('## 比较\n\n'+normalized,'standard',3),/### 3\.1　实施条件/);
});
