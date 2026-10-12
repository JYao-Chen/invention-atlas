import {test} from 'node:test';
import assert from 'node:assert/strict';
import {monitorBrief} from '../src/server/monitor-brief';
test('monitor brief distinguishes initialization and changes with actual record sources',()=>{
 const records=[{id:'A',sourceUrl:'https://example.org/A',sourceName:'source'},{id:'B',sourceUrl:'https://example.org/B'}];
 const baseline=monitorBrief([{patent:'A',change:'基线收录'}],true,records);
 assert.deepEqual(baseline.counts,{baseline:1,added:0,removed:0,updated:0});
 assert.match(baseline.interpretation,/不表示新公开/);
 const changed=monitorBrief([{patent:'A',change:'记录变化',changed_fields:['claims']},{patent:'B',change:'移出返回集'}],false,records);
 assert.deepEqual(changed.counts,{baseline:0,added:0,removed:1,updated:1});
 assert.deepEqual(changed.events[0].fields,['claims']);
 assert.equal(changed.events[1].sourceUrl,records[1].sourceUrl);
 assert.match(changed.interpretation,/排名变化/);
 assert.deepEqual(monitorBrief([],false,records).events,[]);
});
test('brief refuses invented source records or unknown event types',()=>{
 assert.throws(()=>monitorBrief([{patent:'A',change:'新增'}],false,[]),/缺少对应/);
 assert.throws(()=>monitorBrief([{patent:'A',change:'授权'}],false,[{id:'A'}]),/未知/);
});
test('monitor brief preserves an independent before/after snapshot of changed fields',()=>{
 const rows=[{patent:'A',change:'记录变化',changed_fields:['title','claims'],field_changes:[{field:'title',before:'原标题',after:'修改标题'},{field:'claims',before:['原权利要求'],after:['修改权利要求']}]}];
 const brief=monitorBrief(rows,false,[{id:'A',sourceUrl:'https://example.org/A'}]);
 assert.deepEqual(brief.events[0].changes,rows[0].field_changes);
 (rows[0].field_changes[1].after as string[])[0]='后续编辑';
 assert.deepEqual(brief.events[0].changes?.[1].after,['修改权利要求']);
});
