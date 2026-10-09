import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {AnalysisResult,Patent} from '../src/lib/types';
import {linkRows,readResult,resultContract} from '../src/server/result-contract';
import {reportResult} from '../src/server/report-input';
import {retrieveResults} from '../src/server/report-retrieval';
import {TOOL_DEFS} from '../src/server/tools';
import {sourceBundle} from '../src/server/agent';
const p=(id:string,year:string,title:string,abstract:string):Patent=>({id,title,abstract,applicants:['Alpha'],assignees:[],inventors:[],publicationDate:year+'-01-01',filingDate:'',ipc:['G06F16/00'],cpc:[],claims:[],description:'',citations:[],familyId:'',familyMembers:[],legalStatus:'',legalAsOf:'',sourceUrl:'https://example.org/'+id,sourceName:'test',rawText:'',locations:{}});
const records=[p('US1','2020','Vehicle identity','vehicle vehicle ledger'),p('US2','2021','Identity','ledger identity'),p('US3','2021','Vehicles','vehicle ledger')];
const result=(tool:string,rows:AnalysisResult['rows']):AnalysisResult=>({id:tool,tool,title:tool,status:'completed',datasetId:'test',params:{},summary:'computed',rows,evidence:[],warnings:[],method:'actual method',createdAt:'2026-10-09'});
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
