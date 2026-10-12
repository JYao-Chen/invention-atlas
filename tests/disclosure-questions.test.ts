import {test} from 'node:test';
import assert from 'node:assert/strict';
import {disclosureQuestions} from '../src/server/disclosure-questions';
test('disclosure questions retain exact field positions and never mutate the source',async()=>{
 const source={title:'测试材料',solution:'传感器连接控制器。'};
 const questions=await disclosureQuestions(source,new AbortController().signal,async()=>JSON.stringify({questions:[{question:'传感器向控制器发送什么信号？',reason:'明确接口和输入内容。',passage:1,quote:'传感器连接控制器。'}]}));
 assert.deepEqual(questions[0].evidence,{field:'solution',quote:source.solution,start:0,end:source.solution.length});
 assert.deepEqual(source,{title:'测试材料',solution:'传感器连接控制器。'});
});
test('unsupported quotes fail after bounded repair; empty material never invokes a model',async()=>{
 let calls=0;await assert.rejects(disclosureQuestions({title:'测试',solution:'已有材料'},new AbortController().signal,async()=>{calls++;return JSON.stringify({questions:[{question:'请补参数？',reason:'理解方案',passage:1,quote:'不存在原文'}]});}),/引文/);assert.equal(calls,2);
 await assert.rejects(disclosureQuestions({title:'仅名称'},new AbortController().signal,async()=>{throw new Error('must not call');}),/填写技术材料/);
 const empty=await disclosureQuestions({title:'测试',solution:'已有材料'},new AbortController().signal,async()=>'{"questions":[]}');assert.deepEqual(empty,[]);
});
