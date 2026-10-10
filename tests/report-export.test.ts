import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Run,AnalysisResult} from '../src/lib/types';
import {exportReportHtml} from '../src/server/report-export';
const result:AnalysisResult={id:'word-result',datasetId:'test',tool:'generate_wordcloud',title:'关键词词频',status:'completed',params:{},summary:'真实统计',method:'词频TF、文档频率DF与平滑TF-IDF=(1+ln TF)*(1+ln((N+1)/(DF+1)))；去停用词',warnings:[],evidence:[],createdAt:'2026-10-10',rows:[{word:'ledger',tf:4,documents:2,tfidf:3},{word:'</script><script>bad()</script>',tf:1,documents:1,tfidf:1}],chart:{kind:'bar',x:'word',y:'tfidf'},rowSources:[{row:0,word:'ledger',patentIds:['US1A1'],representatives:[{patent:'US1A1',title:'Ledger',sourceUrl:'https://example.com',quote:'A ledger.'}]}]};
const run:Run={id:'test',conversationId:'test',datasetId:'test',question:'Test',status:'completed',plan:[],results:[result],answer:'## Findings\n\n正文公式 $\\frac{N+1}{DF+1}$\n\n[[chart:word-result]]\n\n## Conclusion\n\n说明。',error:'',model:'test',createdAt:'2026-10-10'};
const assets={js:'console.log("offline");',css:'body{color:#222}'};
test('report embeds full snapshot and runtime, preserves chart insertion and renders method formulas',()=>{
 const html=exportReportHtml({title:'Test report',run},assets);assert.equal((html.match(/<mfrac>/g)||[]).length,2);assert.ok(html.indexOf('关键词词频')<html.indexOf('Conclusion'));assert.ok(html.includes('console.log("offline")'));assert.ok(!html.includes('src="http'));assert.ok(!html.includes('href="http'));
 const json=html.match(/<script id="report-data" type="application\/json">([\s\S]*?)<\/script>/)![1];assert.deepEqual(JSON.parse(json).run.results[0],result);assert.ok(!json.includes('<script>'));assert.ok(html.includes('A ledger.'));
});
test('unreferenced charts remain in export and repeated markers do not duplicate static results',()=>{
 const html=exportReportHtml({title:'Test',run:{...run,answer:'[[chart:word-result]]\n\n[[chart:word-result]]'}},assets);assert.equal((html.match(/<h2>关键词词频<\/h2>/g)||[]).length,1);
 assert.ok(exportReportHtml({title:'Test',run:{...run,answer:'No markers'}},assets).includes('<h2>关键词词频</h2>'));
});
