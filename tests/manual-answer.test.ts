import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
process.env.PATENT_DATA_DIR=mkdtempSync(join(tmpdir(),'atlas-manual-test-'));
const {manualChapters}=await import('../src/server/manual-answer');
const {questions}=await import('../src/lib/suggestions');
const {guideChapters}=await import('../src/lib/help-guide');
test('manual buttons find every chapter with exact documentation',()=>{
 for(const c of guideChapters)assert.ok(manualChapters(`请介绍“${c.title}”功能在专利挖掘中的用途、计算方法和操作步骤，以及结果应如何解释。`).some(v=>v.id===c.id),c.title);
});
test('method consultation supports concepts, aliases and multi-method comparisons',()=>{
 assert.ok(manualChapters('生命周期统计是什么，怎么用？').some(c=>c.tool==='analyze_lifecycle'));
 assert.ok(manualChapters('请解释CR3和HHI').some(c=>c.tool==='analyze_concentration'));
 assert.ok(manualChapters('共引和耦合有什么区别？').some(c=>c.tool==='analyze_citation_network'));
 assert.ok(manualChapters('什么是PCA与K-means？').some(c=>c.tool==='analyze_clustering'));
 assert.equal(manualChapters('系统有哪些功能？').length,33);
});
test('analysis requests and recommendations never get replaced by manual answers',()=>{
 for(const q of Object.values(questions))assert.equal(manualChapters(q).length,0);
 for(const q of ['分析这批专利的生命周期并解释结果','介绍公开趋势并运行一下','请运行生命周期统计','对当前数据集计算HHI并说明含义','生成年度关键词报告'])assert.equal(manualChapters(q).length,0,q);
});
