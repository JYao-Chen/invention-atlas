import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseProposalFeatures,extractProposalFeatures} from '../src/server/proposal-features';

const proposal='装置包括温度传感器和控制器。控制器根据温度测量结果调整冷却阀开度。';
const draft={summary:'温度反馈控制装置',features:[{feature:'测量温度',role:'component',quote:'温度传感器',evidence_start:1,evidence_end:1}],questions:[]};
test('proposal features retain exact source evidence and label model-assisted interpretation',()=>{
 const result=parseProposalFeatures(proposal,draft),feature=result.features[0];assert.equal(feature.id,'F1');assert.equal(proposal.slice(feature.start,feature.end),feature.quote);assert.equal(feature.modelAssisted,true);
 assert.throws(()=>parseProposalFeatures(proposal,{...draft,features:[{...draft.features[0],quote:'压力传感器'}]}),/原文/);
 assert.throws(()=>parseProposalFeatures(proposal,{...draft,features:[{...draft.features[0],evidence_end:99}]}),/编号/);
});
test('invalid model evidence is retried once without accepting an invented feature',async()=>{
 let calls=0;const result=await extractProposalFeatures(proposal,new AbortController().signal,async()=>JSON.stringify(++calls===1?{...draft,features:[{...draft.features[0],quote:'压力传感器'}]}:draft));
 assert.equal(calls,2);assert.equal(result.features[0].quote,'温度传感器');
});
