import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reportResult,reportDataset} from '../src/server/report-input';
import type {AnalysisResult} from '../src/lib/types';
const result=(rows:AnalysisResult['rows']):AnalysisResult=>({id:'test',datasetId:'test',evidence:[],createdAt:'2026-10-09',tool:'analyze_yearly_keywords',title:'年度关键词',status:'completed',params:{},summary:'',warnings:[],method:'',rows});
test('coverage proportions have explicit percentage units for reports',()=>{
 const bundle=reportResult(result([{field:'legalStatus',coverage:0.008}]));
 assert.equal((bundle.rows as {coveragePercent:number}[])[0].coveragePercent,0.8);
 assert.equal(reportDataset(undefined),undefined);
});
test('all yearly keywords survive the former twelve-row cutoff',()=>{
 const rows=Array.from({length:8},(_,i)=>Array.from({length:10},(_,j)=>({year:String(2018+i),word:'word'+j,tfidf:j+1}))).flat();
 const bundle=reportResult(result(rows));assert.equal(bundle.rowCount,80);assert.equal(bundle.presentation.complete,true);assert.deepEqual(new Set((bundle.rows as typeof rows).map(r=>r.year)),new Set(rows.map(r=>r.year)));
});
test('large results cover every year and result type with explicit omitted counts',()=>{
 const rows=Array.from({length:20},(_,i)=>Array.from({length:50},(_,j)=>({year:String(2000+i),word:'word'+j}))).flat();
 const bundle=reportResult(result(rows));assert.equal(bundle.presentation.omittedRows,880);assert.equal(bundle.presentation.groups.length,20);assert.ok(bundle.presentation.groups.every(g=>g.includedRows===6));assert.equal(rows.length,1000);
 const mixed=reportResult(result(Array.from({length:200},()=>({type:'coupling'})).concat([{type:'co_citation'}])));assert.ok((mixed.rows as {type:string}[]).some(r=>r.type==='co_citation'));
});
test('nested arrays are not silently truncated and long text is explicitly marked',()=>{
 const bundle=reportResult(result([{keywords:Array.from({length:40},(_,i)=>'word'+i),quote:'x'.repeat(2100)}]));
 const rows=bundle.rows as {keywords:string[];quote:string}[];assert.equal(rows[0].keywords.length,40);assert.match(rows[0].quote,/省略/);assert.deepEqual(bundle.presentation.shortenedTextPaths,['rows/0/quote']);
 assert.equal(reportResult(result([])).presentation.complete,true);
});
