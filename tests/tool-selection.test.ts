import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {TOOL_DEFS} from '../src/lib/tool-definitions';
import {toolSelectionDatasetSchema,toolSelectionMetrics,evaluateToolSelection,toolSelectionSplit} from '../src/server/tool-selection-evaluation';

test('tool selection corpus has reproducible 22/11 split and covers every registered tool and group',async()=>{
 const raw=JSON.parse(await readFile(new URL('../evals/tool-selection/questions.json',import.meta.url),'utf8'));
 const data=toolSelectionDatasetSchema.parse(raw);assert.equal(data.cases.length,33);
 assert.equal(data.cases.filter(c=>c.split==='dev').length,22);assert.equal(data.cases.filter(c=>c.split==='test').length,11);
 const covered=new Set(data.cases.flatMap(c=>c.expectedTools));for(const [tool] of TOOL_DEFS)assert.ok(covered.has(tool),tool);
 const split=toolSelectionSplit(data.cases.map(c=>c.id).reverse());for(const c of data.cases)assert.equal(split.get(c.id),c.split);
 raw.cases[0].expectedTools=['nonexistent_tool'];assert.throws(()=>toolSelectionDatasetSchema.parse(raw));
});
test('mock Planner evaluation uses set semantics, per-question metrics and macro means',async()=>{
 assert.deepEqual(toolSelectionMetrics(['a','a','b'],['a','c']),{precision:0.5,recall:0.5,exactMatch:0});
 assert.deepEqual(toolSelectionMetrics([],['a']),{precision:0,recall:0,exactMatch:0});
 const result=await evaluateToolSelection([{id:'a',question:'第一题',expectedTools:['search_patents','get_dataset_summary'],split:'dev'},{id:'b',question:'第二题',expectedTools:['audit_dataset'],split:'dev'}],async question=>question==='第一题'?['search_patents','search_patents']:['audit_dataset']);
 assert.deepEqual(result.macro,{count:2,precision:1,recall:0.75,exactMatch:0.5});assert.equal(result.rows[0].recall,0.5);
 assert.match(result.discipline,/不得.*调整/);
});
