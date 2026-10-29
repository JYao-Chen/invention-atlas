import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {executeRun,type AgentDependencies} from '../src/server/agent';
import {auditReport} from '../src/server/report-audit';
import {store} from '../src/server/db';
import {normalize,datasetMeta} from '../src/server/importers';
import {executeQueuedRun} from '../src/server/queued-agent';
import type {Job} from '../src/server/job-store';
import type {Run,AnalysisResult,Params} from '../src/lib/types';

async function fixture(){
 const patent=normalize({id:'US123001B1',title:'Sensor authentication',abstract:'Synthetic sensor authentication fixture',claims:[{number:1,text:'A sensor and controller.'}]},'MOCK');
 const meta=datasetMeta('Orchestration fixture',[patent],'fixture','fixture');await store.saveDataset(meta,[patent]);const conversation=await store.newConversation(meta.id);
 const run:Run={id:randomUUID(),conversationId:conversation.id,datasetId:meta.id,question:'研究 sensor authentication 专利',status:'running',plan:[],results:[],answer:'',error:'',model:'mock',createdAt:new Date().toISOString()};await store.saveRun(run);return {run,meta,patent};
}
const mockResult=(tool:string,params:Params,datasetId:string):AnalysisResult=>({id:tool+':'+(params.query||''),tool,params,datasetId,title:tool,status:'completed',summary:'结果共 3 项',rows:[{patent:'US123001B1',count:3,ratio:0.5}],method:'mock',evidence:['US123001B1'],warnings:[],createdAt:'2026-10-29T00:00:00Z'});
const noModel:AgentDependencies['review']=async()=>{throw new Error('Unexpected model request');};
const noPlan:AgentDependencies['planned']=async()=>{throw new Error('Unexpected planner request');};
const goodReport:AgentDependencies['generateReport']=async run=>{run.answer='US123001B1 共 3 项，占 50%。';await store.saveRun(run);};

test('report audit checks every patent, numeric literal and chart against results without counting IDs or requested parameters',()=>{
 const result=mockResult('get_dataset_summary',{top_k:999},'d');
 assert.deepEqual(auditReport('US123001B1 共 3 项，占 50%。\n\n[[chart:'+result.id+']]',[result]),[]);
 const issues=auditReport('US999999B1 共 999 项。\n\n[[chart:missing-result]]',[result]);assert.deepEqual(issues.map(i=>i.kind),['patent','number','chart']);
 assert.equal(auditReport('1. US123001B1 共 3 项。',[result]).length,0);
 assert.deepEqual(auditReport('usre12345e1 指标为 1e-6。',[{...result,evidence:['USRE12345E1'],rows:[{value:1e-6}]}]),[]);
 assert.deepEqual(auditReport('US123001B1 共 3 项。 [[chart:ab12-0000-cd34-0000-ef56]]',[{...result,id:'ab12-0000-cd34-0000-ef56'}]),[]);
});
test('report audit matches numeric evidence rounded to the precision of the reported value',()=>{
 const cases:[number,string,boolean][]=[
  [0.4237,'42.4%',true],
  [0.4237,'42%',true],
  [3.14159,'3.14',true],
  [998.6,'999',true],
  [1000,'999',false],
  [0.5,'51%',false],
 ];
 for(const [source,reported,supported] of cases){
  const result={...mockResult('get_dataset_summary',{},'d'),summary:'合成数值证据',rows:[{value:source}]};
  const issues=auditReport('指标为 '+reported+'。',[result]);
  assert.deepEqual(issues,supported?[]:[{kind:'number',value:reported,paragraph:1,reason:'数值未在工具结果中找到；请核对原始值、单位及推算依据'}],source+' → '+reported);
 }
});
test('report audit rounding includes the lower decimal boundary and excludes the upper boundary',()=>{
 for(const [source,reported,supported] of [[3.135,'3.14',true],[3.145,'3.14',false],[0.4235,'42.4%',true],[0.4245,'42.4%',false]] as const){
  const result={...mockResult('get_dataset_summary',{},'d'),summary:'合成数值证据',rows:[{value:source}]};
  assert.equal(auditReport('指标为 '+reported+'。',[result]).length,supported?0:1,source+' → '+reported);
 }
});
test('conditional research loop performs at most two additional searches and persists decisions/rounds/exclusions',async()=>{
 const {run}=await fixture();let reviews=0;const searches:string[]=[];
 await executeRun(run,undefined,false,new AbortController().signal,{
  planned:async()=>({scope:{mode:'search',counting:'publication'},steps:[{tool:'search_patents',params:{query:'sensor',top_k:30}},{tool:'get_dataset_summary',params:{}}]}),
  review:async()=>JSON.stringify({decision:'expand',reason:'证据仍不足，需要补充传感器身份认证证据',query:'sensor '+(++reviews),excluded:reviews===1?[{patent:'US123001B1',reason:'需要复核'}]:[]}),
  executeTool:async(tool,params,meta)=>{if(tool==='search_patents')searches.push((params as Params).query!);return mockResult(tool,params as Params,meta.id);},generateReport:goodReport,
 });
 assert.deepEqual(searches,['sensor','sensor 1','sensor 2']);assert.equal(reviews,3);assert.equal(run.orchestration?.searchRounds,2);assert.equal(run.reviews?.length,3);assert.deepEqual(run.scope?.patentIds,[]);
 assert.ok(run.scope?.notes.some(n=>n.includes('上限')));assert.equal(run.reportAudit?.passed,true);
 const events=await store.events(run.id),decisions=events.filter(e=>e.event==='research-review').map(e=>JSON.parse(e.payload));assert.deepEqual(decisions.map(d=>d.next),['Search','Search','Analysis']);assert.equal(decisions[2].searchRounds,2);
 const saved=(await store.run(run.id))!;await executeRun(saved,undefined,false,new AbortController().signal,{planned:noPlan,review:noModel,executeTool:async()=>{throw new Error('Unexpected tool');},generateReport:async()=>{throw new Error('Unexpected report');}});
 assert.equal(saved.answer,run.answer);assert.equal(reviews,3);
});
test('Claim, Comparison and Citation run concurrently after Analysis, join before report, and save deterministic plan order',async()=>{
 const {run}=await fixture(),started:string[]=[],finished:string[]=[];
 let release!:()=>void;const together=new Promise<void>(resolve=>{release=resolve;}),deadline=setTimeout(()=>release(),2000);
 const branches=['analyze_claim_elements','compare_claims','analyze_citation_network'];
 const params=(tool:string):Params=>tool==='compare_claims'?{patent_numbers:['US123001B1','US123002B1']}:{patent_numbers:['US123001B1']};
 await executeRun(run,undefined,false,new AbortController().signal,{
  planned:async()=>({scope:{mode:'dataset',counting:'publication'},steps:[{tool:'get_dataset_summary',params:{}},...branches.map(tool=>({tool,params:params(tool)}))]}),review:noModel,
  executeTool:async(tool,p,meta)=>{
   if(branches.includes(tool)){assert.ok(finished.includes('get_dataset_summary'));started.push(tool);if(started.length===3){clearTimeout(deadline);release();}await together;assert.equal(started.length,3,'all independent nodes start before the first one completes');}
   finished.push(tool);return mockResult(tool,p as Params,meta.id);
  },generateReport:async(...args)=>{assert.equal(finished.length,4);await goodReport(...args);},
 });
 assert.equal(run.results.every(r=>r.status==='completed'),true);assert.deepEqual(run.results.map(r=>r.tool),['get_dataset_summary',...branches]);
 assert.deepEqual(run.results.map(r=>r.rows),run.plan.map(p=>mockResult(p.tool,p.params,run.datasetId).rows));
 const events=await store.events(run.id);assert.equal(events.filter(e=>e.event==='stage-start'&&['Claim','Comparison','Citation'].includes(JSON.parse(e.payload).stage)).length,3);
});
test('audit requests exactly one correction; second failure retains text and appends issues; queue recovery preserves the completed report',async()=>{
 const {run}=await fixture();let reports=0;
 await executeRun(run,[{tool:'get_dataset_summary',params:{}}],false,new AbortController().signal,{
  planned:noPlan,review:noModel,executeTool:async(tool,p,meta)=>mockResult(tool,p as Params,meta.id),generateReport:async r=>{reports++;if(reports===2)assert.equal(r.reportAudit?.passed,false);r.answer='US999999B1 共 999 项。';await store.saveRun(r);},
 });
 assert.equal(reports,2);assert.equal(run.reportAudit?.attempt,2);assert.equal(run.orchestration?.reportRevisions,1);assert.ok(run.answer.startsWith('US999999B1'));assert.match(run.answer,/自动审计待复核问题/);
 const events=await store.events(run.id);assert.equal(events.filter(e=>e.event==='report-revision').length,1);assert.equal(events.filter(e=>e.event==='report-audit').length,2);assert.equal(events.filter(e=>e.event==='text-reset').length,1);
 // A lease can expire between saving the appendix and saving stage-complete.
 const beforeCheckpoint=structuredClone(run);beforeCheckpoint.orchestration!.completed=beforeCheckpoint.orchestration!.completed.filter(key=>key!=='Audit:1');
 await executeRun(beforeCheckpoint,run.plan,false,new AbortController().signal,{planned:noPlan,review:noModel,executeTool:async()=>{throw new Error('Must reuse results');},generateReport:async()=>{throw new Error('Must reuse report');}});
 assert.equal(beforeCheckpoint.answer,run.answer);assert.deepEqual(beforeCheckpoint.reportAudit,run.reportAudit);
 const job:Job={id:randomUUID(),runId:run.id,actorId:'fixture',organizationId:'fixture',projectId:'fixture',kind:'analysis',payload:{forced:run.plan,toolOnly:false},state:'running',attempts:2,workerId:'fixture',cancelRequested:false};
 await executeQueuedRun(job,new AbortController().signal);const recovered=(await store.run(run.id))!;assert.equal(recovered.answer,run.answer);assert.equal(recovered.status,'completed');assert.equal((await store.events(run.id)).filter(e=>e.event==='report-revision').length,1);
});
test('legacy completed Report checkpoint is preserved while adding the new report audit',async()=>{
 const {run}=await fixture(),result=mockResult('get_dataset_summary',{counting:'publication'},run.datasetId);run.plan=[{tool:result.tool,params:result.params}];run.results=[result];run.executionStage='Report';run.answer='US123001B1 共 3 项。';await store.saveRun(run);
 await executeRun(run,run.plan,false,new AbortController().signal,{planned:noPlan,review:noModel,executeTool:async()=>{throw new Error('Must reuse results');},generateReport:async()=>{throw new Error('Must reuse legacy report');}});
 assert.equal(run.answer,'US123001B1 共 3 项。');assert.equal(run.reportAudit?.passed,true);
});
test('successful audit correction ends the loop and incomplete parallel stage resumes without repeating completed siblings',async()=>{
 const {run}=await fixture(),claim=mockResult('analyze_claim_elements',{patent_numbers:['US123001B1'],counting:'publication'},run.datasetId);
 run.plan=[{tool:claim.tool,params:claim.params},{tool:'compare_claims',params:{patent_numbers:['US123001B1','US123002B1'],counting:'publication'}},{tool:'analyze_citation_network',params:{counting:'publication'}}];run.results=[claim];run.scope={mode:'dataset',counting:'publication',patentIds:['US123001B1'],selections:[],notes:[]};run.orchestration={version:1,completed:['Planner','Search:0','ResearchReview:0','Analysis','Claim'],searchRounds:0,pendingSearch:false,reportRevisions:0};run.executionStage='Claim';await store.saveRun(run);
 const tools:string[]=[];let reports=0;
 await executeRun(run,undefined,false,new AbortController().signal,{planned:noPlan,review:noModel,executeTool:async(tool,p,meta)=>{tools.push(tool);return mockResult(tool,p as Params,meta.id);},generateReport:async(...args)=>{if(++reports===1){args[0].answer='US999999B1';await store.saveRun(args[0]);}else await goodReport(...args);}});
 assert.deepEqual(tools.sort(),['analyze_citation_network','compare_claims']);assert.equal(run.results[0].id,claim.id);assert.equal(reports,2);assert.equal(run.reportAudit?.passed,true);assert.doesNotMatch(run.answer,/待复核问题/);
});
test('cancellation reaches parallel tool signals, drains pending work, and keeps incomplete stages recoverable',async()=>{
 const {run}=await fixture(),controller=new AbortController();let running=0,finished=0;
 await assert.rejects(executeRun(run,[{tool:'analyze_claim_elements',params:{}},{tool:'compare_claims',params:{}},{tool:'analyze_citation_network',params:{}}],false,controller.signal,{review:noModel,generateReport:async()=>{throw new Error('Report must not start');},executeTool:async(_tool,_p,_meta,_records,context)=>{
  running++;if(running===3)setImmediate(()=>controller.abort(new Error('Cancelled fixture')));
  try{await new Promise<void>((_resolve,reject)=>context!.signal!.addEventListener('abort',()=>reject(context!.signal!.reason),{once:true}));throw new Error('unreachable');}finally{finished++;}
 }}));
 assert.equal(running,3);assert.equal(finished,3);assert.equal(run.orchestration?.completed.includes('Report:0'),false);assert.equal(run.results.length,0);
});
test('a late failed parallel tool keeps deterministic result order and is visible to the execution audit',async()=>{
 const {run}=await fixture();let finishFailure!:()=>void;const citationFinished=new Promise<void>(resolve=>{finishFailure=resolve;});
 await executeRun(run,[{tool:'compare_claims',params:{}},{tool:'analyze_citation_network',params:{}}],false,new AbortController().signal,{planned:noPlan,review:noModel,generateReport:goodReport,executeTool:async(tool,p,meta)=>{
  if(tool==='compare_claims'){await citationFinished;throw new Error('Synthetic comparison failure');}
  finishFailure();return mockResult(tool,p as Params,meta.id);
 }});
 assert.deepEqual(run.results.map(r=>r.tool),['compare_claims','analyze_citation_network']);assert.deepEqual(run.results.map(r=>r.status),['failed','completed']);assert.equal(run.audit?.[0].status,'failed');
});
