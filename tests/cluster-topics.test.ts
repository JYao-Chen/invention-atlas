import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyTopicNames} from '../src/server/cluster-topics';
import type {Row} from '../src/lib/types';
test('topic naming preserves membership and checks evidence against representatives',()=>{
 const rows:Row[]=[{cluster:1,count:2,patents:['a','b'],representatives:['a'],keywords:'identity'}];
 const topic={cluster:1,name:'身份认证',explanation:'代表专利涉及数字身份认证技术。',evidence:['a'],mixed:false};
 const named=applyTopicNames(rows,{topics:[topic]});assert.equal(named[0].topic_name,'身份认证');assert.deepEqual(named[0].patents,['a','b']);assert.equal(rows[0].topic_name,undefined);
 assert.throws(()=>applyTopicNames(rows,{topics:[{...topic,evidence:['outside']}]}));assert.throws(()=>applyTopicNames(rows,{topics:[]}));assert.equal(applyTopicNames(rows,{topics:[{...topic,mixed:true}]})[0].topic_name,'混合主题 · 身份认证');
});
