import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classificationStatistics,keepReviewOnSubject} from '../src/server/research-intent';
const candidate={scope:{mode:'search' as const,counting:'publication' as const},steps:[{tool:'search_patents',params:{query:'communication protocol',ipc:'H04L',year_start:2019,top_k:30}},{tool:'analyze_burst_terms',params:{}}]};
test('H04L burst statistics use all classification records, not a method search or Top-K',()=>{
 const plan=classificationStatistics('利用关键词突现工具识别H04L小类中近期增长显著的技术术语以补充通信协议分析',candidate);
 assert.equal(plan.scope.mode,'dataset');assert.deepEqual(plan.steps,[{tool:'analyze_burst_terms',params:{ipc:'H04L'}}]);
});
test('explicit years propagate to every statistical step without changing output limits',()=>{
 const plan=classificationStatistics('分析H04L在2018—2025年的年度关键词及突现',{...candidate,steps:[...candidate.steps,{tool:'analyze_yearly_keywords',params:{top_k:10}}]});
 assert.ok(plan.steps.every(s=>s.params.ipc==='H04L'&&s.params.year_start===2018&&s.params.year_end===2025));assert.equal(plan.steps[1].params.top_k,10);
 assert.equal(classificationStatistics('统计H04L在2020年的词频',candidate).steps[0].params.year_end,2020);
});
test('similarity search, multiple classifications and explicit method patents remain searches',()=>{
 for(const q of ['查找H04L的相似专利','对H04L和G06Q进行分析','检索H04L中采用突现分析方法的专利'])assert.equal(classificationStatistics(q,candidate),candidate);
});
test('review cannot replace the research subject with the analysis method and discard its candidates',()=>{
 const review={decision:'expand' as const,reason:'寻找分析方法',query:'burst detection AND patent mining',excluded:[{patent:'A',reason:'未涉及突现算法'}]};
 const fixed=keepReviewOnSubject('对通信协议专利进行关键词突现分析',review);assert.equal(fixed.decision,'limited');assert.deepEqual(fixed.excluded,[]);assert.equal(fixed.query,undefined);
 assert.equal(keepReviewOnSubject('查找突现算法相关专利',review),review);
 assert.equal(keepReviewOnSubject('通信协议分析',{...review,query:'network routing'}).query,'network routing');
});
