import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateNoveltyStrategies,generateNoveltyStrategies} from '../src/server/novelty-strategies';
const features=[{id:'F1',feature:'温度测量',quote:'温度传感器'}];
const strategies=[{name:'测量',query:'temperature sensor',featureIds:['F1'],rationale:'温度测量'},{name:'反馈',query:'temperature measurement feedback',featureIds:['F1'],rationale:'反馈相关术语扩展'}];
test('strategy validation binds confirmed features and rejects duplicates and unsupported operators',()=>{
 assert.equal(validateNoveltyStrategies(features,strategies).length,2);
 assert.throws(()=>validateNoveltyStrategies(features,[strategies[0],{...strategies[1],featureIds:['F9']}]),/未确认/);
 assert.throws(()=>validateNoveltyStrategies(features,[strategies[0],{...strategies[1],query:strategies[0].query}]),/重复/);
 assert.equal(validateNoveltyStrategies(features,[strategies[0],{...strategies[1],query:'temperature AND valve'}]).length,2);
 assert.throws(()=>validateNoveltyStrategies(features,[strategies[0],{...strategies[1],query:'temperature AND'}]));
});
test('strategy generation preserves feature associations',async()=>{
 const result=await generateNoveltyStrategies(features,new AbortController().signal,async()=>JSON.stringify({strategies}));assert.deepEqual(result,strategies);
});
