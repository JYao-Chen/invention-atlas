import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import MathMarkdown from '../src/components/MathMarkdown';
import {mathMarkdown} from '../src/lib/math-markdown';
import {reportMarkdownHtml} from '../src/server/report-markdown';

const render=(text:string)=>renderToStaticMarkup(createElement(MathMarkdown,{children:text}));
test('downloaded HTML contains offline MathML and retains escaped content',()=>{
 const html=reportMarkdownHtml('权重 (1+ln TF)*(1+ln((N+1)/(DF+1)))\n\n<script>alert(1)</script>');
 assert.ok(html.includes('<math'));assert.ok(html.includes('<mfrac>'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('katex-html'));
});
test('inline, block and common LaTeX delimiters render fractions and MathML',()=>{
 for(const text of [String.raw`权重 $\frac{N+1}{DF+1}$。`,String.raw`权重 \(\frac{N+1}{DF+1}\)。`,String.raw`\[\frac{N+1}{DF+1}\]`,'$$\n\\frac{N+1}{DF+1}\n$$']){
  const html=render(text);assert.ok(html.includes('class="katex"'));assert.ok(html.includes('<mfrac>'));assert.ok(!html.includes('katex-error'));
 }
});
test('historical TF-IDF is typeset without changing its calculation',()=>{
 const text='TF-IDF采用平滑公式: (1+ln TF)*(1+ln((N+1)/(DF+1)))，权重仅反映区分度。';
 const html=render(text);assert.ok(html.includes('class="katex"'));assert.ok(html.includes('<mfrac>'));assert.ok(html.includes('权重仅反映区分度'));
 assert.ok(!render(mathMarkdown(text)).includes('katex-error'));
 assert.equal(mathMarkdown(mathMarkdown(text)),mathMarkdown(text));
});
test('code, links and tables remain Markdown; partial streaming formulas do not throw',()=>{
 const code='`(1+ln TF)*(1+ln((N+1)/(DF+1)))`\n\n```tex\n\\[x\\]\n```';
 assert.equal(mathMarkdown(code),code);assert.ok(!render(code).includes('class="katex"'));
 const html=render('[专利](#patent/A)\n\n|指标|值|\n|---|---|\n|TF|3|');assert.ok(html.includes('<table>'));assert.ok(html.includes('href="#patent/A"'));
 for(const part of ['$','$$\n\\frac{N','权重 $\\frac{N+1}{'])assert.doesNotThrow(()=>render(part));
});
