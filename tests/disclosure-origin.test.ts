import {test} from 'node:test';
import assert from 'node:assert/strict';
import {disclosureOrigin} from '../src/server/disclosure-origin';
test('disclosure report origin fixes the saved source version and escapes title formatting',()=>{
 const source={proposal:'任务中的完整方案快照',proposalOrigin:{type:'disclosure',id:'SOURCE-A',revision:3,title:'方案 [正文](地址)\n# 标题'}};
 const result=disclosureOrigin(source)!;
 assert.equal(result.title,source.proposalOrigin.title);assert.equal(result.revision,3);
 assert.ok(result.markdown.includes('保存第3版'));assert.ok(result.markdown.includes('SOURCE-A'));assert.ok(!result.markdown.includes('\n# 标题'));
 assert.match(result.markdown,/后续材料修改不改变/);
 assert.equal(disclosureOrigin({proposal:'直接填写的查新方案'}),undefined);
 assert.throws(()=>disclosureOrigin({proposalOrigin:{...source.proposalOrigin,revision:0}}));
});
