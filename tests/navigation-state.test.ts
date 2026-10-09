import {test} from 'node:test';
import assert from 'node:assert/strict';
import {restoredNavigation,pageIds} from '../src/lib/navigation-state';
test('refresh restores each page independently of saved conversation',()=>{for(const page of pageIds)assert.deepEqual(restoredNavigation(JSON.stringify({page,assistant:false}),''),{page,assistant:false,reportId:undefined});});
test('guide deep links override stored analysis and report state',()=>{assert.deepEqual(restoredNavigation(JSON.stringify({page:'analysis',assistant:true,reportId:'old'}),'#guide/charts'),{page:'help',assistant:false});});
test('assistant and saved report presentation are preserved',()=>{assert.deepEqual(restoredNavigation(JSON.stringify({page:'analysis',assistant:true,reportId:'report-1'}),''),{page:'analysis',assistant:true,reportId:'report-1'});});
test('without navigation state a saved conversation cannot force a jump',()=>{assert.deepEqual(restoredNavigation(null,''),{page:'data',assistant:false});assert.deepEqual(restoredNavigation('{broken',''),{page:'data',assistant:false});});
