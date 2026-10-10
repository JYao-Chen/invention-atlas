import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareReport,REPORT_WRITING_GUIDANCE} from '../src/server/report-preparation';
import type {Patent,Run,AnalysisResult} from '../src/lib/types';
const results:AnalysisResult[]=[{id:'first',tool:'analyze_yearly_keywords',title:'年度关键词',status:'completed',datasetId:'test',params:{},summary:'',rows:[{word:'ledger'}],warnings:[],method:'TF-IDF',evidence:[],createdAt:'2026-10-10',rowSources:[{row:0,patentIds:['P1'],representatives:[{patent:'P1',title:'Ledger',sourceUrl:'',quote:'原文'}]}]},{id:'second',tool:'analyze_lifecycle',title:'生命周期',status:'unavailable',datasetId:'test',params:{},summary:'不足',rows:[],warnings:['不足'],method:'',evidence:[],createdAt:'2026-10-10'}];
const run={results,scope:{patentIds:['P1','P2'],counting:'family'},audit:[{tool:'missing',status:'missing'}]} as Run;
const records=[{id:'P1',publicationDate:'2020-01-01'},{id:'P2',publicationDate:'2022-01-01'},{id:'P3',publicationDate:'2025-01-01'}] as Patent[];
test('report preparation counts actual scope, preserves tool limits and only offers supported charts',()=>{
 const p=prepareReport(run,records);assert.equal(p.scopePublications,2);assert.deepEqual(p.publicationYears,[{year:'2020',count:1},{year:'2022',count:1}]);assert.equal(p.completed,1);assert.equal(p.limited,1);assert.deepEqual(p.missing,['missing']);assert.equal(p.tools[0].representatives,1);assert.equal(p.charts.length,1);assert.equal(p.charts[0].reference,'[[chart:first]]');assert.ok(p.scopeNote.includes('公开记录'));
});
test('empty restricted scope never becomes the whole dataset and report instruction stays evidence bound',()=>{
 assert.equal(prepareReport({...run,scope:{...run.scope!,patentIds:[]}},records).scopePublications,0);
 assert.ok(REPORT_WRITING_GUIDANCE.includes('不要补造'));assert.ok(REPORT_WRITING_GUIDANCE.includes('简单问题保持简洁'));
});
