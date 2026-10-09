import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cleanFollowups,questionLines} from '../src/server/followups';
test('followups exclude duplicates, current question, invalid and oversized entries',()=>{
 assert.deepEqual(cleanFollowups(['比较申请人集中度','比较申请人集中度','查看技术主题分布',42,'短','x'.repeat(151),'分析主要申请人','检查引用关系变化','读取代表专利原文'],'分析主要申请人'),['比较申请人集中度','查看技术主题分布','检查引用关系变化','读取代表专利原文']);
 assert.deepEqual(cleanFollowups(null,''),[]);
});
test('JSONL emits each complete question before generation finishes and handles split chunks',()=>{
 const got:string[]=[];const parser=questionLines('原始问题',q=>got.push(q));
 parser.push('{"question":"比较申请');assert.equal(got.length,0);
 parser.push('人集中度"}\n{"question":"查看技术主题分布"}\n');assert.equal(got.length,2);
 parser.push('invalid\n{"question":"检查引用关系变化"}');parser.finish();assert.equal(got.length,3);
});
