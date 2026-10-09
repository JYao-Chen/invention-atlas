import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stepSchema,completeRecommendedStep,toolDefaults,recommendedTool} from '../src/server/planning';
import {questions} from '../src/lib/suggestions';
import type {Patent} from '../src/lib/types';
const records=[{id:'REAL-SHORT',title:'Title',abstract:'Abstract',claims:[{number:1,text:'Actual claim'}],description:'Actual description'},{id:'REAL-LONG',title:'Title',abstract:'Abstract',claims:[{number:1,text:'Actual longer claim'}],description:'Actual longer description'}] as Patent[];
test('every recommended question binds a valid real tool and its required parameters',()=>{
 for(const [tool,question] of Object.entries(questions)){
  assert.equal(recommendedTool(question),tool);
  const step=completeRecommendedStep({tool,params:{}},question,records);
  assert.equal(stepSchema.parse(step).tool,tool);
 }
});
test('missing monitor and read parameters fail before execution; arbitrary questions are not overwritten',()=>{
 assert.equal(stepSchema.safeParse({tool:'monitor_patent_changes',params:{}}).success,false);
 assert.equal(stepSchema.safeParse({tool:'read_patent_details',params:{}}).success,false);
 assert.deepEqual(completeRecommendedStep({tool:'monitor_patent_changes',params:{query:'battery',strategy_id:'custom'}},'监测电池专利',records).params,{query:'battery',strategy_id:'custom'});
 assert.deepEqual(toolDefaults('analyze_tech_matrix',records).patent_numbers,['REAL-SHORT']);
 assert.equal(stepSchema.safeParse({tool:'audit_search_strategy',params:{strategies:[{name:'a',query:''},{name:'b',query:'x'}]}}).success,false);
});
