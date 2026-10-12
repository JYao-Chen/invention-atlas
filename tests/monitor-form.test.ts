import {test} from 'node:test';
import assert from 'node:assert/strict';
import {monitorParamsFromForm} from '../src/lib/monitor-form';
test('monitor form submits typed full parameters and removes cleared filters',()=>{
 const values=new FormData();for(const [key,value] of Object.entries({query:' blockchain ',strategy_id:' monitoring ',top_k:'35',counting:'family',year_start:'2020',year_end:'2025',applicant:' Acme ',ipc:'H04L'}))values.set(key,value);
 assert.deepEqual(monitorParamsFromForm(values),{query:'blockchain',strategy_id:'monitoring',top_k:35,counting:'family',year_start:2020,year_end:2025,applicant:'Acme',ipc:'H04L'});
 for(const key of ['year_start','year_end','applicant','ipc'])values.set(key,' ');
 assert.deepEqual(monitorParamsFromForm(values),{query:'blockchain',strategy_id:'monitoring',top_k:35,counting:'family'});
 values.set('counting','unknown');assert.throws(()=>monitorParamsFromForm(values),/计数口径/);
});
