import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {reportReading} from '../src/lib/report-reading';
import ReportReader from '../src/components/ReportReader';
import Markdown from '../src/components/MathMarkdown';
import {questions} from '../src/lib/suggestions';
import {professionalExamples} from '../src/lib/guide-launch';
import {ARGUMENT_WRITING_GUIDANCE} from '../src/server/report-preparation';

test('saved reports retain source numbering, repeated headings and fenced code while exposing a contents list',()=>{
 const text='# 标题\n\n## 研究问题\n\n有依据的发现 [1]。\n\n### 案例\n\n技术比较 [2]。\n\n```txt\n## 代码中的标题\n```\n\n### 案例\n\n另一案例。\n\n## 资料来源\n\n1. [专利原文](https://example.org/patent) · claims，位置 24\n\n2. 统计结果 · 分析结果 result-id';
 const read=reportReading(text);assert.deepEqual(read.sources.map(s=>s.number),[1,2]);assert.equal(read.sections.filter(s=>s.title==='案例').length,2);assert.ok(!read.sections.some(s=>s.title==='代码中的标题'));
 const html=renderToStaticMarkup(createElement(ReportReader,{text,results:[],onPatent:()=>{}}));
 assert.ok(html.includes('aria-label="报告目录"'));assert.equal((html.match(/class="report-citation"/g)||[]).length,2);
 const links=[...html.matchAll(/href="#([^"]+source-[12])"/g)].map(m=>m[1]);assert.equal(links.length,2);for(const id of links)assert.ok(html.includes('id="'+id+'"'));assert.ok(html.includes('https://example.org/patent'));
});
test('citation rendering preserves code, existing links, math and unknown numeric brackets',()=>{
 const html=renderToStaticMarkup(createElement(Markdown,{children:'论点 [1,2] 和 [1–2]。未知 [9]。`[1]` [已有链接](https://example.org) $[1]$。',citations:{prefix:'chapter-',numbers:[1,2]}}));
 assert.equal((html.match(/class="report-citation"/g)||[]).length,4);assert.ok(html.includes('<code>[1]</code>'));assert.ok(html.includes('[9]'));assert.ok(html.includes('href="https://example.org"'));assert.ok(html.includes('katex'));
});
test('entry examples express ordinary goals and research guidance delegates evidence planning to the agent',()=>{
 for(const question of [...Object.values(questions),...Object.values(professionalExamples).map(e=>e.question)]){assert.ok(question.length<=70,question);assert.ok(!/调用|K-means|TF-IDF|CR3|HHI/.test(question),question);}
 for(const term of ['证据','推理','合理解释','用户只需表达研究目标','不把工具名称'])assert.ok(ARGUMENT_WRITING_GUIDANCE.includes(term),term);
});
