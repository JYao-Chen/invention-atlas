import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readingReportContext,READING_REPORT_GUIDANCE} from '../src/server/reading-report-guidance';
import type {AnalysisResult} from '../src/lib/types';
test('reading report context distinguishes extraction absence from source absence',()=>{
 const result:AnalysisResult={id:'reading',tool:'analyze_patent_reading',title:'阅读',status:'completed',datasetId:'fixture',summary:'',warnings:[],method:'fixture',evidence:[],createdAt:'2026-10-12',params:{patent_numbers:['TEST']},rows:[{kind:'means',section:'claim'}]};
 const context=readingReportContext([result]);assert.deepEqual(context[0].extractedItems,{problem:0,means:1,effect:0});assert.deepEqual(context[0].patentIds,['TEST']);assert.match(context[0].absenceMeaning,/不等于/);assert.match(READING_REPORT_GUIDANCE,/即使加“可能”/);assert.match(READING_REPORT_GUIDANCE,/禁止断言技术构成完整/);
});
