import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Run,AnalysisResult} from '../src/lib/types';
import {monitorNotificationSnapshot} from '../src/server/monitor-notification-snapshot';
import {monitorBrief} from '../src/server/monitor-brief';
const result:AnalysisResult={id:'result',tool:'monitor_patent_changes',title:'监测',status:'unavailable',datasetId:'fixture',params:{strategy_id:'subscription:fixture:v2'},summary:'检索范围内没有记录',rows:[],evidence:[],warnings:['仅检查已入库数据'],method:'fixture',createdAt:'2026-10-12T00:00:00Z'};
const run:Run={id:'run',conversationId:'conversation',datasetId:'fixture',question:'monitor',status:'partial',plan:[{tool:'monitor_patent_changes',params:result.params}],results:[result],answer:'',error:'',model:'fixture',createdAt:result.createdAt};
test('unavailable monitor results notify with the actual reason, not fake zero-change counts',()=>{
 const snapshot=monitorNotificationSnapshot(run)!;assert.equal(snapshot.failure?.status,'unavailable');assert.equal(snapshot.failure?.message,result.summary);assert.deepEqual(snapshot.params,result.params);assert.equal(snapshot.brief,undefined);assert.deepEqual(snapshot.failure?.warnings,result.warnings);
});
test('failed runs retain errors and planned scope even when the tool never returns',()=>{
 const snapshot=monitorNotificationSnapshot({...run,status:'failed',results:[],error:'数据读取失败'})!;assert.equal(snapshot.failure?.status,'failed');assert.equal(snapshot.failure?.message,'数据读取失败');assert.deepEqual(snapshot.params,result.params);assert.equal(snapshot.brief,undefined);
 assert.equal(monitorNotificationSnapshot({...run,status:'running'}),undefined);assert.equal(monitorNotificationSnapshot({...run,status:'cancelled'}),undefined);
});
test('successful initialization and unchanged observations stay quiet; actual changes notify',()=>{
 const completed={...result,status:'completed' as const,monitorBrief:monitorBrief([],false,[])};
 assert.equal(monitorNotificationSnapshot({...run,status:'completed',results:[completed]}),undefined);
 const baseline={...completed,monitorBrief:monitorBrief([{patent:'A',change:'基线收录'}],true,[{id:'A'}])};
 assert.equal(monitorNotificationSnapshot({...run,status:'completed',results:[baseline]}),undefined);
 const changed={...completed,monitorBrief:monitorBrief([{patent:'A',change:'新增'}],false,[{id:'A'}])};
 const snapshot=monitorNotificationSnapshot({...run,status:'completed',results:[changed]})!;
 assert.equal(snapshot.failure,undefined);assert.equal(snapshot.brief?.counts.added,1);
});
