import {test} from 'node:test';
import assert from 'node:assert/strict';
import {professionalInput,workflowCatalog} from '../src/server/professional-workflows';
import {TOOL_DEFS} from '../src/server/tools';

test('professional catalog exposes fully wired stages without treating that as worker health',()=>{
 const catalog=workflowCatalog(),tools=new Set<string>(TOOL_DEFS.map(d=>d[0]));
 assert.equal(catalog.length,4);assert.equal(new Set(catalog.map(w=>w.id)).size,4);
 for(const workflow of catalog){assert.equal(workflow.executionAvailable,true);assert.ok(workflow.version);assert.ok(workflow.stages.some(s=>s.confirmation));assert.equal(new Set(workflow.stages.map(s=>s.id)).size,workflow.stages.length);for(const stage of workflow.stages){assert.ok(stage.outputs.length);assert.ok(stage.tools.every(tool=>tools.has(tool)));}}
 catalog[0].title='mutated';assert.notEqual(workflowCatalog()[0].title,'mutated');
});
test('professional task inputs preserve explicit bounds and reject missing proposals or duplicate entities',()=>{
 assert.equal(professionalInput.parse({workflow:'technology-landscape',datasetId:'d',yearStart:2020,yearEnd:2025}).counting,'publication');
 assert.equal(professionalInput.safeParse({workflow:'technology-landscape',datasetId:'d',yearStart:2025,yearEnd:2020}).success,false);
 assert.equal(professionalInput.safeParse({workflow:'competitor-analysis',datasetId:'d',entities:['A','A']}).success,false);
 assert.equal(professionalInput.safeParse({workflow:'novelty-search',datasetId:'d',proposal:''}).success,false);
 assert.equal(professionalInput.safeParse({workflow:'patent-layout',datasetId:'d'}).success,false);
 assert.equal(professionalInput.parse({workflow:'patent-layout',datasetId:'d',objective:'明确传输效率研发目标与范围'}).workflow,'patent-layout');
});
