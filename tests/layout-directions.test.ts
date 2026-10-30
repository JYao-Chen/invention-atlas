import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateLayoutDirections,suggestLayoutDirections} from '../src/server/layout-directions';
import {layoutMatrix} from '../src/server/layout-matrix';
import type {AnalysisResult} from '../src/lib/types';
import {layoutDirectionSearchPlan} from '../src/server/professional-layout';
test('shared direction queries produce one record and one passage step in execution order',()=>{
 const plan=layoutDirectionSearchPlan([{query:'network transmission'},{query:'latency reduction'},{query:'network transmission'}]);
 assert.deepEqual(plan.map(step=>[step.tool,step.params.query]),[['search_patents','network transmission'],['search_patent_passages','network transmission'],['search_patents','latency reduction'],['search_patent_passages','latency reduction']]);
 assert.ok(plan.every(step=>step.params.top_k===30&&step.params.counting==='publication'));
 assert.deepEqual(layoutDirectionSearchPlan([]),[]);
});
const rows=[{function:'F',effect:'E',patent:'P',quote:'SYNTHETIC first'},{function:'G',effect:'H',patent:'Q',quote:'SYNTHETIC second'},{function:'X',effect:'Y',patent:'S',quote:'SYNTHETIC excluded'}];
const source:AnalysisResult={id:'R',tool:'analyze_tech_matrix',title:'fixture',datasetId:'D',status:'completed',params:{},summary:'SYNTHETIC',rows,layoutMatrix:layoutMatrix(rows),method:'fixture',warnings:[],evidence:[],createdAt:'2026-10-12'};
const confirmation={resultId:'R',objective:'SYNTHETIC research network design',functions:['F','G','X'].map(source=>({source,label:source,include:source!=='X'})),effects:['E','H','Y'].map(source=>({source,label:source,include:true}))};
const direction={title:'SYNTHETIC',function:'F',effect:'H',hypothesis:'SYNTHETIC recombination hypothesis',evidenceRows:[0,1],query:'network transmission',reason:'SYNTHETIC relevance to objective'};
test('directions distinguish observed relationships from unsupported recombination and preserve literal evidence',()=>{
 const result=validateLayoutDirections(source,confirmation,{directions:[direction,{...direction,effect:'E',evidenceRows:[0],query:'latency reduction'}],unresolved:['SYNTHETIC feasibility needs verification']});
 assert.equal(result.directions[0].relationStatus,'unobserved_recombination_hypothesis');assert.equal(result.directions[0].observedPublications,0);assert.equal(result.directions[0].evidence[1].quote,'SYNTHETIC second');
 assert.equal(result.directions[1].relationStatus,'observed_in_selected_evidence');assert.equal(result.directions[1].observedPublications,1);assert.equal(result.legalAssessmentPerformed,false);
});
test('directions reject invented, excluded, repeated and unrelated evidence labels',()=>{
 for(const invalid of [{...direction,function:'invented'},{...direction,evidenceRows:[0]},{...direction,evidenceRows:[0,2]},{...direction,evidenceRows:[0,0,1]}])assert.throws(()=>validateLayoutDirections(source,confirmation,{directions:[invalid],unresolved:[]}));
 assert.throws(()=>validateLayoutDirections(source,confirmation,{directions:[direction,direction],unresolved:[]}),/不能重复/);
 assert.equal(validateLayoutDirections(source,confirmation,{directions:[],unresolved:['no supported hypothesis']}).directions.length,0);
});
test('model generation passes confirmed source context and validates output before accepting it',async()=>{
 const result=await suggestLayoutDirections(source,confirmation,new AbortController().signal,async(system,user)=>{assert.match(system,/不检索专利布局/);assert.equal(JSON.parse(user).objective,confirmation.objective);return JSON.stringify({directions:[direction],unresolved:[]});});assert.equal(result.directions.length,1);
 await assert.rejects(()=>suggestLayoutDirections(source,confirmation,new AbortController().signal,async()=>JSON.stringify({directions:[{...direction,evidenceRows:[99]}],unresolved:[]})),/保留的原始证据/);
});
