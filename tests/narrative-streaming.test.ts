import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import PatentNarrative from '../src/components/PatentNarrative';
import type {AnalysisResult} from '../src/lib/types';
const results:AnalysisResult[]=['first','second'].map(id=>({id,tool:'analyze_trend',title:id,status:'completed',datasetId:'test',params:{},summary:'',rows:[],warnings:[],evidence:[],method:'',createdAt:'2026-10-10'}));
const render=(text:string,streaming:boolean)=>renderToStaticMarkup(createElement(PatentNarrative,{text,streaming,results,onPatent:()=>{}}));
test('streaming hides unreferenced results and inserts only complete chart markers',()=>{
 assert.equal((render('',true).match(/class="result-panel"/g)||[]).length,0);
 assert.equal((render('发现。[[chart:first',true).match(/class="result-panel"/g)||[]).length,0);
 const html=render('发现。[[chart:first]]后续解读。',true);
 assert.equal((html.match(/class="result-panel"/g)||[]).length,1);
 assert.ok(html.indexOf('发现。')<html.indexOf('class="result-panel"'));
});
test('finished or stopped narrative appends omitted results without duplicating referenced charts',()=>{
 assert.equal((render('[[chart:first]][[chart:first]]',false).match(/class="result-panel"/g)||[]).length,2);
 assert.equal((render('',false).match(/class="result-panel"/g)||[]).length,2);
});
