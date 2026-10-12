import {test} from 'node:test';
import assert from 'node:assert/strict';
import {materialOrigin} from '../src/server/material-origin';
import {professionalInput} from '../src/server/professional-workflows';
test('material origin records OCR and selected pages without claiming source interpretation',()=>{
 const origin={id:'M',filename:'[方案].pdf',ocrJobId:'J',pages:[2,4]};
 const value=materialOrigin({materialOrigin:origin});assert.ok(value);assert.ok(value.markdown.includes('OCR任务 J'));assert.ok(value.markdown.includes('选页 2、4'));assert.ok(value.markdown.includes('\\[方案\\]'));assert.ok(value.markdown.includes('方案特征仍需用户确认'));
 assert.equal(materialOrigin({}),undefined);
 assert.throws(()=>professionalInput.parse({workflow:'novelty-search',datasetId:'D',proposal:'SYNTHETIC PROPOSAL INPUT FOR TEST',materialOrigin:origin,proposalOrigin:{type:'disclosure',id:'X',title:'X',revision:1}}),/只能声明一个/);
});
