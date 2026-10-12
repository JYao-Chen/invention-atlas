import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reportLineDiff} from '../src/lib/report-line-diff';
test('report line differences preserve both original versions exactly',()=>{
 for(const [before,after] of [['标题\n旧结论\n引用 [1]\n','标题\n新结论\n引用 [1]\n'],['','新增'],['删除',''],['a\nb\na','a\na'],['  原文\n\n',' 原文\n']]){
  const changes=reportLineDiff(before,after);
  assert.equal(changes.filter(c=>c.kind!=='added').map(c=>c.text).join('\n'),before);
  assert.equal(changes.filter(c=>c.kind!=='removed').map(c=>c.text).join('\n'),after);
 }
});
test('changed paragraphs are marked without marking stable citations',()=>{
 assert.deepEqual(reportLineDiff('旧判断\n[chart:r1]\n原文','新判断\n[chart:r1]\n原文'),[{kind:'removed',text:'旧判断'},{kind:'added',text:'新判断'},{kind:'same',text:'[chart:r1]'},{kind:'same',text:'原文'}]);
});
