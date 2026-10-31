import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {AnalysisResult,Patent} from '../src/lib/types';
import {linkRows,readResult,resultContract} from '../src/server/result-contract';
import {reportResult} from '../src/server/report-input';
import {retrieveResults} from '../src/server/report-retrieval';
import {TOOL_DEFS} from '../src/server/tools';
import {sourceBundle} from '../src/server/agent';
import {monitorBrief} from '../src/server/monitor-brief';
const p=(id:string,year:string,title:string,abstract:string):Patent=>({id,title,abstract,applicants:['Alpha'],assignees:[],inventors:[],publicationDate:year+'-01-01',filingDate:'',ipc:['G06F16/00'],cpc:[],claims:[],description:'',citations:[],familyId:'',familyMembers:[],legalStatus:'',legalAsOf:'',sourceUrl:'https://example.org/'+id,sourceName:'test',rawText:'',locations:{}});
const records=[p('US1','2020','Vehicle identity','vehicle vehicle ledger'),p('US2','2021','Identity','ledger identity'),p('US3','2021','Vehicles','vehicle ledger')];
const result=(tool:string,rows:AnalysisResult['rows']):AnalysisResult=>({id:tool,tool,title:tool,status:'completed',datasetId:'test',params:{},summary:'computed',rows,evidence:[],warnings:[],method:'actual method',createdAt:'2026-10-09'});
test('monitor field changes remain available with their provenance semantics',()=>{
 const row={patent:'US1',change:'记录变化',changed_fields:['description'],field_changes:[{field:'description',before:'previous literal source',after:'updated literal source'}]};
 const saved=result('monitor_patent_changes',[row]);
 const response=readResult(saved);
 assert.deepEqual(response.rows,[row]);
 assert.match(response.contract.fields.find(field=>field.name==='field_changes')!.definition,/上次基线保存值/);
 assert.match(response.contract.fields.find(field=>field.name==='field_changes')!.definition,/不自动表示官方更正/);
 assert.deepEqual(reportResult(saved).rows,[row]);
});
test('monitor brief paginates events without changing full-result counts or report snapshot',()=>{
 const rows=[{patent:'US1',change:'新增'},{patent:'US2',change:'移出返回集'}];
 const saved=result('monitor_patent_changes',rows);
 saved.monitorBrief=monitorBrief(rows,false,records);
 const page=readResult(saved,{offset:1,limit:1});
 assert.equal(page.monitorBrief!.totalEvents,2);
 assert.deepEqual(page.monitorBrief!.counts,{baseline:0,added:1,removed:1,updated:0});
 assert.equal(page.monitorBrief!.events.length,1);
 assert.equal(page.monitorBrief!.events[0].patent,'US2');
 assert.deepEqual(reportResult(saved).monitorBrief,saved.monitorBrief);
 assert.equal(saved.monitorBrief.events.length,2);
 assert.deepEqual(readResult(saved,{year:'2099'}).monitorBrief!.events,[]);
 assert.deepEqual(readResult(saved,{year:'2099'}).monitorBrief!.counts,page.monitorBrief!.counts);
});
test('keyword linkage uses exact same tokenizer, year and source excerpts, not arbitrary dataset IDs',()=>{
 const r=result('analyze_yearly_keywords',[{year:'2020',word:'vehicle',documents:1},{year:'2021',word:'vehicle',documents:1},{word:'unknown'}]);r.rowSources=linkRows(r,records);
 assert.deepEqual(r.rowSources.map(s=>s.patentIds),[['US1'],['US3']]);assert.equal(r.rowSources[0].representatives[0].field,'title');
 for(const source of r.rowSources)for(const rep of source.representatives){const patent=records.find(p=>p.id===rep.patent)!;assert.ok(patent[rep.field as 'title'|'abstract'].includes(rep.quote!));}
 const whole=result('generate_wordcloud',[{word:'vehicle'}]);assert.deepEqual(linkRows(whole,records)[0].patentIds,['US1','US3']);
 const burst=result('analyze_burst_terms',[{word:'vehicle',start_year:'2021',end_year:'2021'}]);assert.deepEqual(linkRows(burst,records)[0].patentIds,['US3']);
});
test('portfolio summary IPC strings do not incorrectly filter applicant members',()=>{
 const r=result('analyze_entity_portfolio',[{applicant:'Alpha',count:3,ipc:'G06F, H04L'}]);assert.equal(linkRows(r,records)[0].patentIds.length,3);
});
test('all 26 tool contracts expose actual fields, read endpoint and explicit empty reasons',()=>{
 for(const [tool] of TOOL_DEFS){const c=resultContract(result(tool,[{count:3}]));assert.ok(c.purpose);assert.equal(c.fields[0].name,'count');assert.match(c.readEndpoint,/api\/results/);assert.equal(resultContract(result(tool,[])).emptyReason,'computed');}
});
test('scope evidence is never promoted to arbitrary representative patents in report sources',()=>{
 const summary=result('get_dataset_summary',[{records:3}]);summary.evidence=records.map(p=>p.id);assert.equal(sourceBundle([summary],records).sources.length,0);
 const keywords=result('generate_wordcloud',[{word:'vehicle'}]);keywords.rowSources=linkRows(keywords,records);assert.deepEqual(sourceBundle([keywords],records).sources.map(p=>p.id),['US1','US3']);
});
test('report includes actual graph edges, scope and row sources; readback supports filtering and pagination',()=>{
 const r=result('generate_wordcloud',[{word:'vehicle'},{word:'ledger'}]);r.rowSources=linkRows(r,records);r.scope={inputCount:3,analyzedCount:3,counting:'publication',patentIds:records.map(p=>p.id),entityRules:[]};r.graph={nodes:[{id:'US1',label:'US1',kind:'patent',value:1},{id:'US2',label:'US2',kind:'patent',value:1}],edges:[{source:'US1',target:'US2',weight:1,kind:'citation'}]};
 const preview=reportResult(r);assert.equal(preview.scope?.analyzedCount,3);assert.equal(preview.graph?.edges[0].source,'US1');assert.equal(preview.rowSources?.[0].representatives[0].patent,'US1');
 const page=readResult(r,{word:'vehicle',limit:1});assert.equal(page.total,1);assert.equal('rows'in page&&(page.rows||[])[0].word,'vehicle');
 assert.equal(readResult(r,{limit:1}).nextOffset,1);assert.equal(readResult(r,{offset:1,limit:1}).nextOffset,null);
 assert.equal(retrieveResults([r],[{resultId:r.id,word:'ledger'}])[0].total,1);assert.throws(()=>retrieveResults([r],[{resultId:'fabricated'}]));
});

test('patent membership filtering keeps original provenance indices and checks exact IDs',()=>{
 const r=result('analyze_clustering',[{cluster:1,patents:['US1']},{cluster:2,patents:['US2','US3']},{cluster:3}]);
 r.rowSources=[{row:1,patentIds:['US2','US3'],representatives:[]},{row:2,patentIds:['US4'],representatives:[]}];
 const page=readResult(r,{patent:'US3'});
 assert.equal(page.total,1);assert.equal(page.rows![0].cluster,2);assert.equal(page.rowSources![0].row,1);
 assert.equal(readResult(r,{patent:'US4'}).rows![0].cluster,3);
 assert.equal(readResult(r,{patent:'US'}).total,0);
 assert.equal(readResult(r,{patent:'US1'}).rows![0].cluster,1);
});
