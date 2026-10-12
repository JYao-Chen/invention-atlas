import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reportSections,replaceReportSection,compareReportSections} from '../src/lib/report-sections';
test('report section boundaries preserve original text and ignore fenced code headings',()=>{
 const text='前言\n\n# 报告\n\n## 方法\n```text\n## 代码不是章节\n```\n\n## 结果\n[[chart:test-id]]\n';
 const sections=reportSections(text);assert.deepEqual(sections.map(section=>section.title),['开篇内容','报告','方法','结果']);assert.equal(sections.map(section=>section.text).join(''),text);
 const updated=replaceReportSection(text,sections[2],'## 方法\n修订内容');assert.match(updated,/修订内容\n## 结果/);assert.match(updated,/\[\[chart:test-id\]\]/);
 assert.throws(()=>replaceReportSection('已变更'+text,sections[2],'新文本'),/章节已变化/);
});
test('section comparison distinguishes duplicate headings and added or removed sections',()=>{
 const before='## 同名\n第一段\n## 同名\n第二段\n## 旧章节\n旧文';
 const after='## 同名\n第一段\n## 同名\n修订第二段\n## 新章节\n新文';
 const changes=compareReportSections(before,after);assert.deepEqual(changes.map(change=>change.status),['changed','added','removed']);assert.match(changes[0].before,/第二段/);assert.match(changes[0].after,/修订第二段/);assert.equal(compareReportSections(after,after).length,0);
});
