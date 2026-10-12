import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {AnalysisResult} from '../src/lib/types';
import {validateReportCharts} from '../src/server/professional-report';

test('professional reports cannot finish with missing or malformed chart references',()=>{
 const results=[{id:'saved-result'}] as AnalysisResult[];
 assert.doesNotThrow(()=>validateReportCharts('正文\n[[chart:saved-result]]',results));
 assert.throws(()=>validateReportCharts('[[chart:missing]]',results),/未保存/);
 assert.throws(()=>validateReportCharts('[[chart:saved-result',results),/格式不完整/);
 assert.doesNotThrow(()=>validateReportCharts('无需图表的正文',results));
});
