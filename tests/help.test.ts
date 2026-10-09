import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {guideChapters} from '../src/lib/help-guide';
import {questions} from '../src/lib/suggestions';
test('manual has distinct chapters, valid destinations, sections and documented demos',()=>{
 assert.equal(new Set(guideChapters.map(c=>c.id)).size,guideChapters.length);
 assert.equal(guideChapters.length,33);
 for(const [index,c] of guideChapters.entries()){assert.ok(['data','analysis','history','reports','settings','assistant'].includes(c.target));assert.ok(c.body.includes('## '));assert.equal(c.number,String(index+1).padStart(2,'0'));assert.ok(!c.title.includes('：'));if(c.question)assert.ok(c.question.length>10);}
});
test('each analytical capability has a detailed chapter, working tool target and demonstration question',()=>{
 const chapters=guideChapters.filter(c=>c.tool);
 assert.equal(chapters.length,26);
 assert.deepEqual(chapters.map(c=>c.tool).sort(),Object.keys(questions).sort());
 for(const c of chapters){assert.equal(c.target,'analysis');assert.equal(c.question,questions[c.tool!]);assert.ok(c.body.length+c.intro.length>=300,c.title);assert.ok(c.sections.length>=3);assert.ok(c.sections.some(s=>s.figure===c.tool),c.title);for(const heading of ['适合回答的问题','参数怎么选','结果怎么读','展示与后续分析','示例问题','解释边界'])assert.ok(!c.sections.some(s=>s.title===heading));}
 assert.ok(!guideChapters.some(c=>/输入与滚动|停止与重试/.test(c.title+' '+c.body)));
 for(const c of guideChapters)assert.ok(!c.body.includes('\\n'),c.title+' must contain real Markdown newlines');
});
test('manual screenshots and generated repository guide stay complete',()=>{
 const markdown=readFileSync('docs/USER-GUIDE.md','utf8');
 for(const c of guideChapters){for(const s of c.sections){assert.ok(markdown.includes(s.body));if(s.figure)for(const size of ['desktop','mobile'])assert.ok(existsSync(`public/help/${size}-${s.figure}.png`));}}
});
