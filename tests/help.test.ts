import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {guideChapters,projectRepository,agentArchitectureMermaid} from '../src/lib/help-guide';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import HelpManual from '../src/components/HelpManual';
import AtlasNavigation from '../src/components/AtlasNavigation';
test('manual exposes contribution links in a dedicated footer and the navigation rail',()=>{
 const html=renderToStaticMarkup(createElement(HelpManual,{onOpen:()=>{},onDemo:()=>{},toolsReady:true}));
 assert.match(html,/<footer class="help-community"/);
 for(const path of ['', '/issues','/pulls'])assert.ok(html.includes(`href="${projectRepository+path}"`));
 const sidebar=renderToStaticMarkup(createElement(AtlasNavigation,{page:'help',assistant:false,collapsed:false,onToggle:()=>{},onNavigate:()=>{},onAssistant:()=>{},username:'test',onLogout:()=>{}}));
 assert.ok(sidebar.includes(`class="atlas-repository-link" href="${projectRepository}"`));
 assert.ok(!guideChapters.find(chapter=>chapter.id==='start')!.sections.some(section=>section.title==='使用与共建'));
});
import {questions} from '../src/lib/suggestions';
test('manual has distinct chapters, valid destinations, sections and documented demos',()=>{
 assert.equal(new Set(guideChapters.map(c=>c.id)).size,guideChapters.length);
 assert.equal(guideChapters.length,50);
 for(const [index,c] of guideChapters.entries()){assert.ok(['data','analysis','history','reports','settings','assistant'].includes(c.target));assert.ok(c.body.includes('## '));assert.equal(c.number,String(index+1).padStart(2,'0'));assert.ok(!c.title.includes('：'));if(c.question)assert.ok(c.question.length>10);}
});
test('manual documents released professional, material, project and integration workflows',()=>{
 for(const id of ['workspace','materials','disclosures','landscape-workflow','competitor-workflow','novelty-workflow','layout-workflow','integrations']){
  const chapter=guideChapters.find(c=>c.id===id);assert.ok(chapter,id);assert.ok(chapter.sections.length>=3);assert.ok(chapter.intro&&chapter.purpose,id);
 }
 assert.ok(guideChapters.find(c=>c.id==='materials')!.body.includes('MinerU'));
 assert.ok(guideChapters.find(c=>c.id==='integrations')!.body.includes('36 项'));
 assert.ok(!guideChapters.some(c=>c.body.includes('当前没有独立对外 MCP')));
});
test('each analytical capability has a detailed chapter, working tool target and demonstration question',()=>{
 const chapters=guideChapters.filter(c=>c.tool);
 assert.equal(chapters.length,29);
 assert.deepEqual(chapters.map(c=>c.tool).sort(),Object.keys(questions).sort());
 for(const c of chapters){assert.equal(c.target,'analysis');assert.equal(c.question,questions[c.tool!]);assert.ok(c.intro&&c.purpose,c.title);assert.ok(c.sections.length>=3);if(c.tool!=='compare_keyword_methods')assert.ok(c.sections.some(s=>s.figure===c.tool),c.title);}
 assert.ok(!guideChapters.some(c=>/输入与滚动|停止与重试/.test(c.title+' '+c.body)));
 for(const c of guideChapters)assert.ok(!c.body.includes('\\n'),c.title+' must contain real Markdown newlines');
});
test('manual screenshots and generated repository guide stay complete',()=>{
 const markdown=readFileSync('docs/USER-GUIDE.md','utf8');
 for(const c of guideChapters){assert.ok(markdown.includes(c.intro));assert.ok(markdown.includes(c.purpose));for(const s of c.sections){assert.ok(markdown.includes(s.body));if(s.figure)for(const size of ['desktop','mobile'])assert.ok(existsSync(`public/help/${size}-${s.figure}.png`));}}
});
test('README navigation and chapter counts match the current manual',()=>{
 const readme=readFileSync('README.md','utf8');
 assert.ok(readme.includes(`${guideChapters.length}个编号章节`));
 const headings=[...readme.matchAll(/^## (\d{2}) /gm)].map(match=>match[1]);
 assert.deepEqual(headings,Array.from({length:16},(_,i)=>String(i+1).padStart(2,'0')));
 for(const match of readme.matchAll(/\]\((docs\/[^)#]+|integrations\/[^)#]+|LICENSE)\)/g))assert.ok(existsSync(match[1]),match[1]);
 assert.ok(!readme.includes('当前没有独立对外 MCP 服务'));
 const manual=readFileSync('docs/USER-GUIDE.md','utf8');
 assert.ok(!manual.includes('patent.jyaochen.cn'));
 assert.ok(manual.includes('`#guide/materials`'));
 assert.ok(!/tallybear/i.test(readme));
});

test('manual cross-references point to existing chapter routes',()=>{
 const ids=new Set(guideChapters.map(c=>c.id));
 for(const chapter of guideChapters)for(const link of chapter.body.matchAll(/\]\(#guide\/([^)]*)\)/g))assert.ok(ids.has(link[1]),chapter.id+' -> '+link[1]);
});

test('architecture guide describes the actual agent modes and exports its research flow',()=>{
 const chapter=guideChapters.find(c=>c.id==='architecture')!;
 assert.ok(chapter);assert.ok(chapter.sections.some(s=>s.diagram==='agent-architecture'));
 for(const term of ['Agent','工具','Skills','LangGraph','Deep Agents','用户'])assert.ok((chapter.intro+chapter.body).includes(term),term);
 assert.ok(readFileSync('docs/USER-GUIDE.md','utf8').includes(agentArchitectureMermaid));
 assert.ok(guideChapters[0].intro.includes('智能体组织研究'));
 assert.ok(chapter.body.includes('subagents: []'));
 assert.ok(chapter.body.includes('一个研究 Agent'));
 assert.ok(agentArchitectureMermaid.includes('C_R[')&&agentArchitectureMermaid.includes('D_READ['));
});


test('architecture inventories cover current nodes, analysis tools, research tools and skills',async()=>{
 const {TOOL_DEFS}=await import('../src/lib/tool-definitions');
 const {RESEARCH_SKILLS}=await import('../src/server/research-skills');
 const {researchToolRows,skillRows}=await import('../src/lib/architecture-guide');
 const chapter=guideChapters.find(c=>c.id==='architecture')!;
 for(const [id]of TOOL_DEFS)assert.ok(chapter.body.includes('`'+id+'`'),id);
 for(const skill of RESEARCH_SKILLS)assert.ok(chapter.body.includes('`'+skill.id+'`'),skill.id);
 assert.deepEqual(skillRows.map(row=>row[0]).sort(),RESEARCH_SKILLS.map(s=>s.id).sort());
 const engine=readFileSync('src/server/deep-research-engine.ts','utf8');
 const tools=[...engine.matchAll(/\},\{name:'([^']+)'/g)].map(m=>m[1]);
 assert.deepEqual(researchToolRows.map(row=>row[0]).sort(),tools.sort());
 const graph=readFileSync('src/server/agent.ts','utf8');
 for(const node of [...graph.matchAll(/\.addNode\('([^']+)'/g)].map(m=>m[1]))assert.ok(chapter.body.includes(node),node);
 assert.ok(chapter.sections.filter(s=>s.body.includes('| ---')).every(s=>s.wide));
 assert.ok(agentArchitectureMermaid.includes('ExecutionAudit'));
 assert.ok(agentArchitectureMermaid.includes('ReviseReport'));
});

test('presentation shortcuts point to available functions and prefill questions without running them',()=>{
 const chapter=guideChapters.find(c=>c.id==='presentation')!;
 assert.equal(chapter.title,'演示');assert.equal(chapter.target,'assistant');
 const actions=chapter.sections.flatMap(s=>s.actions||[]);
 assert.ok(actions.some(a=>a.target==='assistant'&&a.question));
 for(const action of actions){
  if(action.chapterId)assert.ok(guideChapters.some(c=>c.id===action.chapterId),action.chapterId);
  if(action.guideId)assert.ok(guideChapters.some(c=>c.id===action.guideId),action.guideId);
  if(action.mode)assert.ok(['fill','assistant'].includes(action.mode));
 }
});
