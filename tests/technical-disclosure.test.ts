import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareDisclosure,disclosureDraft} from '../src/server/technical-disclosure';
test('disclosure preparation retains supplied facts and asks about missing technical material',()=>{
 const prepared=prepareDisclosure({title:'温度控制装置',solution:'温度传感器连接控制器。'});
 assert.equal(prepared.readyForDraft,false);
 assert.equal(prepared.source.solution,'温度传感器连接控制器。');
 assert.equal(prepared.source.embodiments.length,0);
 assert.ok(prepared.questions.some(question=>question.field==='embodiments'&&question.required));
 assert.ok(!prepared.questions.some(question=>question.field==='solution'));
});
test('claimed observations require supplied evidence while expected effects remain expected',()=>{
 const source={title:'温度控制装置',technicalField:'温度控制',background:'现有装置使用固定阈值。',problem:'适应不同环境温度。',solution:'传感器向控制器输入温度，控制器根据设置阈值控制开关。',embodiments:[{name:'实例一',description:'传感器连接控制器输入端，开关连接输出端。'}],effects:[{statement:'减少误触发',basis:'observed'}]};
 assert.equal(prepareDisclosure(source).readyForDraft,false);
 const expected=prepareDisclosure({...source,effects:[{statement:'减少误触发',basis:'expected'}]});
 assert.equal(expected.readyForDraft,true);
 assert.equal(expected.source.effects[0].basis,'expected');
 const observed=prepareDisclosure({...source,effects:[{statement:'减少误触发',basis:'observed',evidence:'用户提供的测试记录'}]});
 assert.equal(observed.readyForDraft,true);
 assert.equal(observed.source.effects[0].evidence,'用户提供的测试记录');
 assert.throws(()=>prepareDisclosure({...source,inventedClaim:'独立权利要求'}));
});
test('disclosure draft retains supplied material and does not invent absent effects or drawings',()=>{
 const input={title:'温度控制装置',technicalField:'温度控制',background:'现有装置使用固定阈值。',problem:'适应不同环境温度。',solution:'传感器向控制器输入温度。\n控制器根据设置阈值控制开关。',embodiments:[{name:'实例一',description:'传感器连接控制器输入端。'}]};
 const draft=disclosureDraft(input);
 assert.equal(draft.modelAssisted,false);
 assert.equal(draft.source.solution,input.solution);
 assert.ok(draft.markdown.includes('> '+input.solution.replaceAll('\n','\n> ')));
 assert.ok(draft.markdown.includes('本次材料未提供技术效果。'));
 assert.ok(draft.markdown.includes('本次材料未提供附图说明。'));
 assert.equal(draft.sections.length,8);
 assert.throws(()=>disclosureDraft({title:'不完整材料'}),/补齐/);
 const observed=disclosureDraft({...input,effects:[{statement:'测试中触发次数减少。',basis:'observed',evidence:'相同温度序列，比较固定阈值装置。'}]});
 assert.match(observed.markdown,/用户声明的实测效果/);
 assert.ok(observed.markdown.includes('> 相同温度序列，比较固定阈值装置。'));
 assert.match(observed.markdown,/未核验用户声明/);
});
