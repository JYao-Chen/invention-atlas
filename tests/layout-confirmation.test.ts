import {test} from 'node:test';
import assert from 'node:assert/strict';
import {confirmLayout} from '../src/server/layout-confirmation';
import {layoutMatrix} from '../src/server/layout-matrix';
import type {AnalysisResult} from '../src/lib/types';
const rows=[{function:'transmit',effect:'latency',patent:'P',quote:'SYNTHETIC a'},{function:'routing',effect:'speed',patent:'P',quote:'SYNTHETIC b'},{function:'storage',effect:'capacity',patent:'Q',quote:'SYNTHETIC c'}];
const source:AnalysisResult={id:'R',tool:'analyze_tech_matrix',title:'fixture',datasetId:'D',status:'completed',params:{},summary:'SYNTHETIC',rows,layoutMatrix:layoutMatrix(rows),warnings:[],method:'fixture',evidence:[],createdAt:'2026-10-12'};
const input=()=>({resultId:'R',objective:'SYNTHETIC identify transmission evidence',functions:[{source:'transmit',label:'network',include:true},{source:'routing',label:'network',include:true},{source:'storage',label:'storage',include:false}],effects:[{source:'latency',label:'performance',include:true},{source:'speed',label:'performance',include:true},{source:'capacity',label:'capacity',include:true}]});
test('confirmed labels merge counts while preserving every original evidence index and source text',()=>{
 const before=structuredClone(source),confirmed=confirmLayout(source,input());
 assert.deepEqual(source,before);assert.equal(confirmed.matrix.cells.length,1);assert.equal(confirmed.matrix.cells[0].documents,1);assert.deepEqual(confirmed.matrix.cells[0].evidenceRows,[0,1]);assert.equal(confirmed.excludedEvidenceCount,1);assert.equal(confirmed.includedEvidenceCount,2);
 assert.equal(source.rows[1].quote,'SYNTHETIC b');assert.equal(source.rows[1].function,'routing');assert.match(confirmed.interpretation,/用户明确确认/);
});
test('confirmation rejects foreign result, incomplete or fabricated labels and empty selected evidence',()=>{
 assert.throws(()=>confirmLayout(source,{...input(),resultId:'other'}),/真实矩阵/);
 assert.throws(()=>confirmLayout(source,{...input(),functions:input().functions.slice(0,2)}),/完整覆盖/);
 const fabricated=input();fabricated.functions[0].source='invented';assert.throws(()=>confirmLayout(source,fabricated),/完整覆盖/);
 const duplicate=input();duplicate.functions[1].source='transmit';assert.throws(()=>confirmLayout(source,duplicate),/完整覆盖/);
 const empty=input();empty.functions.forEach(m=>m.include=false);assert.throws(()=>confirmLayout(source,empty),/没有证据组合/);
});
test('filtered confirmation keeps original evidence offsets rather than renumbering retained rows',()=>{
 const selected=input();selected.functions[0].include=false;selected.functions[2].include=true;
 const confirmed=confirmLayout(source,selected);assert.deepEqual(confirmed.matrix.cells.flatMap(c=>c.evidenceRows),[1,2]);
});
