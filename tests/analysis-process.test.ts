import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import AnalysisProcess from '../src/components/AnalysisProcess';
import PatentComposer from '../src/components/PatentComposer';
import type {Run} from '../src/lib/types';
test('analysis process opens during preparation and stays collapsed for reports and history',()=>{
 const run={status:'running',answer:'',plan:[],results:[]} as unknown as Run;
 const render=(r:Run)=>renderToStaticMarkup(createElement(AnalysisProcess,{run:r,onPatent:()=>{}}));
 assert.ok(render(run).includes('open=""'));assert.ok(render(run).includes('正在确定研究范围'));
 assert.ok(!render({...run,answer:'报告内容'}).includes('open=""'));
 assert.ok(!render({...run,status:'completed'}).includes('open=""'));
});
test('pending submission immediately exposes its progress and does not offer a server stop yet',()=>{
 const run={status:'running',answer:'',plan:[],results:[],progress:{tool:'request',unit:'正在提交问题并创建分析任务'}} as unknown as Run;
 const html=renderToStaticMarkup(createElement(AnalysisProcess,{run,onPatent:()=>{}}));
 assert.ok(html.includes('正在提交问题'));assert.ok(html.includes('正在提交问题并创建分析任务'));assert.ok(html.includes('open=""'));
 const composer=renderToStaticMarkup(createElement(PatentComposer,{text:'',onText:()=>{},onSend:()=>{},onStop:()=>{},busy:true,disabled:false,stoppable:false}));
 assert.ok(composer.includes('disabled=""'));assert.ok(composer.includes('停止'));
});
