import {test} from 'node:test';
import assert from 'node:assert/strict';
import {monitorDifferences} from '../src/server/monitor-differences';
test('monitor differences preserve actual before and after values including removed fields',()=>{
 assert.deepEqual(monitorDifferences({id:'P',ipc:['A'],description:'old',legalStatus:'pending'},{id:'P',ipc:['B'],description:'new'}),[
  {field:'description',before:'old',after:'new'},
  {field:'ipc',before:['A'],after:['B']},
  {field:'legalStatus',before:'pending',after:null},
 ]);
});
test('JSON persistence does not create changes for omitted optional fields or key ordering',()=>{
 assert.deepEqual(monitorDifferences({id:'P',optional:undefined,claims:[{number:1,text:'same'}]},{claims:[{text:'same',number:1}],id:'P'}),[]);
});
