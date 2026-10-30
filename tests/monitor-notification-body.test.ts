import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import MonitorNotificationBody from '../src/components/MonitorNotificationBody';
import {monitorBrief} from '../src/server/monitor-brief';
test('failure notifications render actual reasons without accessing or inventing change counts',()=>{
 for(const status of ['failed','unavailable'] as const){
  const html=renderToStaticMarkup(createElement(MonitorNotificationBody,{snapshot:{datasetId:'fixture',params:{query:'H04L'},observedAt:'2026-10-12',failure:{status,message:'没有符合范围的记录',warnings:['仅检查已入库数据']}}}));
  assert.match(html,/没有符合范围的记录/);assert.match(html,/仅检查已入库数据/);assert.doesNotMatch(html,/新增0|变化记录/);
  assert.match(html,status==='failed'?/监测执行失败/:/监测数据不足/);
 }
});
test('existing change snapshots retain counts and source links',()=>{
 const html=renderToStaticMarkup(createElement(MonitorNotificationBody,{snapshot:{datasetId:'fixture',params:{},observedAt:'2026-10-12',brief:monitorBrief([{patent:'A',change:'新增'}],false,[{id:'A',sourceUrl:'https://example.org/A'}])}}));
 assert.match(html,/新增1/);assert.match(html,/变化记录/);assert.match(html,/https:\/\/example.org\/A/);assert.doesNotMatch(html,/监测执行失败/);
});
