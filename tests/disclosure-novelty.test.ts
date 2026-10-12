import {test} from 'node:test';
import assert from 'node:assert/strict';
import {disclosureProposal} from '../src/server/disclosure-novelty';
import {professionalInput} from '../src/server/professional-workflows';
test('disclosure novelty source uses actual solution and embodiments, not prior-art background or unverified effects',()=>{
 const input={title:'装置',background:'现有技术中的措施，不属于本方案。',solution:'温度传感器连接控制器，控制器根据设置阈值切换输出端连接的开关。',embodiments:[{name:'实施例',description:'用户给出的连接细节。'}],effects:[{statement:'预期改善性能',basis:'expected'}]};
 const proposal=disclosureProposal(input);assert.ok(proposal.includes(input.solution));assert.ok(proposal.includes(input.embodiments[0].description));assert.ok(!proposal.includes(input.background));assert.ok(!proposal.includes('预期改善性能'));
 const task=professionalInput.parse({workflow:'novelty-search',datasetId:'D',proposal,proposalOrigin:{type:'disclosure',id:'A',revision:2,title:'装置'}});assert.equal(task.workflow,'novelty-search');if(task.workflow==='novelty-search')assert.equal(task.proposalOrigin?.revision,2);
 assert.throws(()=>disclosureProposal({title:'不足',solution:'太短'}),/20字符/);
 assert.throws(()=>disclosureProposal({...input,solution:'a'.repeat(50000),embodiments:input.embodiments}),/不会截断/);
});
