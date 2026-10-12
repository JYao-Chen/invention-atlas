import {test} from 'node:test';
import assert from 'node:assert/strict';
import {monitorSubscriptionInput} from '../src/server/monitor-subscriptions';
test('monitor subscriptions require a real query and strategy and preserve the counting range',()=>{
 const input={datasetId:'D',name:'身份认证监测',intervalHours:24,params:{query:'identity authentication',strategy_id:'identity-v1',year_start:2020,year_end:2025}};
 const parsed=monitorSubscriptionInput.parse(input);assert.equal(parsed.params.top_k,20);assert.equal(parsed.params.counting,'publication');assert.equal(parsed.params.year_start,2020);
 assert.throws(()=>monitorSubscriptionInput.parse({...input,params:{...input.params,query:' '}}));
 assert.throws(()=>monitorSubscriptionInput.parse({...input,params:{...input.params,year_end:2019}}));
 assert.throws(()=>monitorSubscriptionInput.parse({...input,intervalHours:0}));
 assert.throws(()=>monitorSubscriptionInput.parse({...input,params:{...input.params,unsupported:'filter'}}));
});
