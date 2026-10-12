import assert from 'node:assert/strict';
import test from 'node:test';
import {sourceVersionChanges,sourceValueText} from '../src/lib/source-version-diff';
test('source version comparison preserves changes and ignores vectors and editor metadata',()=>{
 const before={title:'旧标题',claims:[{number:1,text:'旧条款'}],embedding:[1],editedAt:'before',description:'不变'};
 const after={title:'新标题',claims:[{text:'新条款',number:1}],embedding:[2],editedAt:'after',description:'不变'};
 assert.deepEqual(sourceVersionChanges(before,after).map(change=>change.label),['标题','权利要求']);
 assert.deepEqual(sourceVersionChanges({claims:[{number:1,text:'条款'}]},{claims:[{text:'条款',number:1}]}),[]);
 assert.equal(sourceVersionChanges(null,{title:'初始标题'})[0].before,undefined);
 assert.equal(sourceValueText([{number:1,text:'原文\n第二行',dependsOn:[2,3]}]),'条款编号：1\n原文：原文\n第二行\n引用条款：2\n\n3');
 assert.equal(sourceValueText(null),'未保存');assert.equal(sourceValueText([]),'无记录');
});
