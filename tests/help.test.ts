import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {guideChapters,projectRepository} from '../src/lib/help-guide';
test('manual links to the project repository and contribution paths',()=>{
 assert.equal(projectRepository,'https://github.com/JYao-Chen/invention-atlas');
 const start=guideChapters.find(chapter=>chapter.id==='start')!;
 assert.ok(start.body.includes(projectRepository));
 assert.ok(start.body.includes(projectRepository+'/issues'));
 assert.ok(start.body.includes('Pull Request'));
});
import {questions} from '../src/lib/suggestions';
test('manual has distinct chapters, valid destinations, sections and documented demos',()=>{
 assert.equal(new Set(guideChapters.map(c=>c.id)).size,guideChapters.length);
 assert.equal(guideChapters.length,43);
 for(const [index,c] of guideChapters.entries()){assert.ok(['data','analysis','history','reports','settings','assistant'].includes(c.target));assert.ok(c.body.includes('## '));assert.equal(c.number,String(index+1).padStart(2,'0'));assert.ok(!c.title.includes('：'));if(c.question)assert.ok(c.question.length>10);}
});
test('manual documents released professional, material, project and integration workflows',()=>{
 for(const id of ['workspace','materials','disclosures','landscape-workflow','competitor-workflow','novelty-workflow','layout-workflow','integrations']){
  const chapter=guideChapters.find(c=>c.id===id);assert.ok(chapter,id);assert.ok(chapter.sections.length>=3);assert.ok(chapter.intro.length+chapter.body.length>=300,id);
 }
 assert.ok(guideChapters.find(c=>c.id==='materials')!.body.includes('MinerU'));
 assert.ok(guideChapters.find(c=>c.id==='integrations')!.body.includes('35项'));
 assert.ok(!guideChapters.some(c=>c.body.includes('当前没有独立对外 MCP')));
});
test('each analytical capability has a detailed chapter, working tool target and demonstration question',()=>{
 const chapters=guideChapters.filter(c=>c.tool);
 assert.equal(chapters.length,28);
 assert.deepEqual(chapters.map(c=>c.tool).sort(),Object.keys(questions).sort());
 for(const c of chapters){assert.equal(c.target,'analysis');assert.equal(c.question,questions[c.tool!]);assert.ok(c.body.length+c.intro.length>=300,c.title);assert.ok(c.sections.length>=3);assert.ok(c.sections.some(s=>s.figure===c.tool),c.title);for(const heading of ['适合回答的问题','参数怎么选','结果怎么读','展示与后续分析','示例问题','解释边界'])assert.ok(!c.sections.some(s=>s.title===heading));}
 assert.ok(!guideChapters.some(c=>/输入与滚动|停止与重试/.test(c.title+' '+c.body)));
 for(const c of guideChapters)assert.ok(!c.body.includes('\\n'),c.title+' must contain real Markdown newlines');
});
test('manual screenshots and generated repository guide stay complete',()=>{
 const markdown=readFileSync('docs/USER-GUIDE.md','utf8');
 for(const c of guideChapters){for(const s of c.sections){assert.ok(markdown.includes(s.body));if(s.figure)for(const size of ['desktop','mobile'])assert.ok(existsSync(`public/help/${size}-${s.figure}.png`));}}
});
test('README navigation and chapter counts match the current manual',()=>{
 const readme=readFileSync('README.md','utf8');
 assert.ok(readme.includes(`${guideChapters.length}个编号章节`));
 const headings=[...readme.matchAll(/^## (\d{2}) /gm)].map(match=>match[1]);
 assert.deepEqual(headings,Array.from({length:17},(_,i)=>String(i+1).padStart(2,'0')));
 for(const match of readme.matchAll(/\]\((docs\/[^)#]+|integrations\/[^)#]+|LICENSE)\)/g))assert.ok(existsSync(match[1]),match[1]);
 assert.ok(!readme.includes('当前没有独立对外 MCP 服务'));
 assert.ok(readFileSync('docs/USER-GUIDE.md','utf8').includes('https://patent.jyaochen.cn/#guide/materials'));
});
