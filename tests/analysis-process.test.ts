import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import AnalysisProcess from '../src/components/AnalysisProcess';
import type {Run} from '../src/lib/types';
test('analysis process opens during preparation and stays collapsed for reports and history',()=>{
 const run={status:'running',answer:'',plan:[],results:[]} as unknown as Run;
 const render=(r:Run)=>renderToStaticMarkup(createElement(AnalysisProcess,{run:r,onPatent:()=>{}}));
 assert.ok(render(run).includes('open=""'));assert.ok(render(run).includes('正在确定研究范围'));
 assert.ok(!render({...run,answer:'报告内容'}).includes('open=""'));
 assert.ok(!render({...run,status:'completed'}).includes('open=""'));
});
