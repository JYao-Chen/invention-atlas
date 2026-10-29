import {ExternalReferenceReader} from '@/server/external/store';
import {NextResponse} from 'next/server';
import {publicMineruSettings,saveMineruSettings} from '@/server/mineru-settings';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {exportReportHtml} from '@/server/report-export';
import {exportReportDocx} from '@/server/report-docx';
import {exportReportPdf} from '@/server/report-pdf';
import {deleteSaved} from '@/server/history-management';
import {store,datasets,dataset,analysisPatents,patent,patentPage,setting,newConversation,conversations,runs,run,saveReport,reports,saveDataset,saveResult,savedResults,events,savePatent,updateDataset,saveRun} from '@/server/db';
import {currentSession} from '@/server/auth';
import {identityEndpoint,projectRequest,apiCredentialRequest} from '@/server/api-access';
import {fulltextEndpoint} from '@/server/fulltext-api';
import {disclosureEndpoint} from '@/server/technical-disclosure-api';
import {materialEndpoint} from '@/server/material-api';
import {modelUsageEndpoint} from '@/server/model-usage-api';
import {modelBudgetEndpoint} from '@/server/model-budget-api';
import {materialOcrEndpoint} from '@/server/material-ocr-api';
import {createMaterialNovelty} from '@/server/material-novelty';
import {ProjectMaterials} from '@/server/project-materials';
import {TechnicalDisclosures} from '@/server/technical-disclosure-store';
import {createDisclosureNovelty} from '@/server/disclosure-novelty';
import {MonitorSubscriptions} from '@/server/monitor-subscriptions';
import {MonitorNotifications} from '@/server/monitor-notifications';
import {SourceUpdates} from '@/server/source-updates';
import {SourceUpdateSchedules} from '@/server/source-update-schedules';
import {sourceUpdatePending,resolveSourceUpdate} from '@/server/source-update-job';
import {submitSourceUpdate,retrySourceUpdate,sourceUpdateTasks} from '@/server/source-update-job';
import {suggestPatentLabels} from '@/server/label-suggestions';
import {TOOL_DEFS,executeTool,capability} from '@/server/tools';
import {toolDefaults,stepSchema} from '@/server/planning';
import {openApiDocument} from '@/server/openapi';
import {nameClusterTopics} from '@/server/cluster-topics';
import {startRun,stopRun,isPending,retryReport} from '@/server/agent';
import {workflowCatalog} from '@/server/professional-workflows';
import {ProfessionalStore} from '@/server/professional-store';
import {db} from '@/server/db';
import {submitProfessionalStage,retryProfessionalStage,regenerateProfessionalReport} from '@/server/professional-submission';
import {followups} from '@/server/followups';
import {generateStarters} from '@/server/starters';
import {readyStarterPool,warmStarterPool} from '@/server/starter-pool';
import {savedResult} from '@/server/db';
import {readResult,resultReadParameters,resultContract,toolInformation} from '@/server/result-contract';
import {importText,datasetMeta} from '@/server/importers';
import {modelConfig,publicModelSettings,resolveModelSettings,saveModelSettings} from '@/server/config';
import {embed,chat} from '@/server/model';
import type {Patent} from '@/lib/types';
import {entityRulesSchema} from '@/server/research';
import {judgmentSchema,evaluateRun} from '@/server/evaluation';
import {enrichmentSchema,enrichBatch} from '@/server/enrichment-job';
import {ProjectAnnotations} from '@/server/project-annotations';
import {ReportVersions} from '@/server/report-versions';
import {ReportPublications} from '@/server/report-publications';
import {ReportComments} from '@/server/report-comments';
import {ReportShares} from '@/server/report-shares';
import {ReportTasks} from '@/server/report-tasks';
import {TaskNotifications} from '@/server/task-notifications';
import {withAccess} from '@/server/postgres';
import {OrganizationModel,withOrganizationModel} from '@/server/organization-model';
import {acquisitionSchema,acquireDlt} from '@/server/acquisition';
import {writeRecord,deleteRecords,deleteDataset,indexDataset,claimIndex,isDataBusy,releaseDataJob,beginDataRead,endDataRead} from '@/server/data-management';
export const runtime='nodejs';export const dynamic='force-dynamic';
const escape=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
async function resources(request:Request,{params}:{params:Promise<{path:string[]}>}){try{
 const {path}=await params;const [resource,id,action]=path;const url=new URL(request.url);const method=request.method;
 if(resource==='source-schedules'){
  const schedules=new SourceUpdateSchedules(db);
  if(method==='GET'&&path.length===1)return NextResponse.json({schedules:await schedules.list()},{headers:{'Cache-Control':'no-store'}});
  if(method==='POST'&&path.length===1)return NextResponse.json(await schedules.save(await request.json()));
  if(method==='DELETE'&&id&&path.length===2){await schedules.remove(id);return NextResponse.json({ok:true});}
  return NextResponse.json({error:'不支持该操作'},{status:405});
 }
 if(resource==='source-updates'){
  const updates=new SourceUpdates(db);
  if(method==='GET'&&id&&action==='pending'&&path.length===3)return NextResponse.json(await sourceUpdatePending(db,id),{headers:{'Cache-Control':'no-store'}});
  if(method==='POST'&&id&&action==='resolve'&&path.length===3)return NextResponse.json(await resolveSourceUpdate(db,id,await request.json()));
  if(method==='POST'&&id==='preview'&&path.length===2)return NextResponse.json(await updates.preview(await request.json()),{headers:{'Cache-Control':'no-store'}});
  if(method==='GET'&&id==='tasks'&&path.length===2)return NextResponse.json(await sourceUpdateTasks(db,z.string().min(1).parse(url.searchParams.get('dataset')),Number(url.searchParams.get('page')??1)),{headers:{'Cache-Control':'no-store'}});
  if(method==='POST'&&id&&action==='retry'&&path.length===3)return NextResponse.json(await retrySourceUpdate(db,id),{status:202});
  if(method==='POST'&&id==='dlt'&&path.length===2){const body=await request.json(),datasetId=z.string().min(1).parse(body?.datasetId);if(isDataBusy(datasetId))throw new Error('数据集已有数据任务，请结束后更新来源');return NextResponse.json(await submitSourceUpdate(db,body),{status:202});}
  if(method==='POST'&&path.length===1){const body=await request.json(),datasetId=z.string().min(1).parse(body?.datasetId);if(isDataBusy(datasetId))throw new Error('数据集已有数据任务，请结束后更新来源');return NextResponse.json(await updates.apply(body),{status:201});}
  if(method==='GET'){const datasetId=z.string().min(1).parse(url.searchParams.get('dataset'));
   if(path.length===1)return NextResponse.json({batches:await updates.batches(datasetId)},{headers:{'Cache-Control':'no-store'}});
   if(path.length===3&&action==='versions')return NextResponse.json(await updates.versionPage(datasetId,id,Number(url.searchParams.get('page')||1)),{headers:{'Cache-Control':'no-store'}});
  }
  return NextResponse.json({error:'不支持该操作'},{status:405});
 }
 if(resource==='monitor-notifications'){
  const notices=new MonitorNotifications(db);
  if(path.length>2)return NextResponse.json({error:'接口不存在'},{status:404});
  if(method==='GET'&&!id){const unread=z.enum(['0','1']).parse(url.searchParams.get('unread')??'0'),archived=z.enum(['0','1']).parse(url.searchParams.get('archived')??'0');return NextResponse.json(await notices.list({page:Number(url.searchParams.get('page')??1),unread:unread==='1',archived:archived==='1'}),{headers:{'Cache-Control':'no-store'}});}
  if(method==='PATCH'&&id){const data=z.object({action:z.enum(['read','archive','restore'])}).strict().parse(await request.json());return NextResponse.json(data.action==='read'?await notices.markRead(id):await notices.archive(id,data.action==='archive'));}
  return NextResponse.json({error:'不支持该操作'},{status:405});
 }
 if(resource==='monitor-subscriptions'){
  const subscriptions=new MonitorSubscriptions(db);
  if(id&&action==='versions'&&path.length===3&&method==='GET')return NextResponse.json({versions:await subscriptions.versions(id)},{headers:{'Cache-Control':'no-store'}});
  if(id&&action==='run'&&path.length===3&&method==='POST')return NextResponse.json(await subscriptions.submit(id,modelConfig().model),{status:202});
  if(path.length>2)return NextResponse.json({error:'接口不存在'},{status:404});
  if(method==='GET'&&!id)return NextResponse.json({subscriptions:await subscriptions.list()},{headers:{'Cache-Control':'no-store'}});
  if(method==='POST'&&!id)return NextResponse.json(await subscriptions.create(await request.json()),{status:201});
  if(method==='PATCH'&&id)return NextResponse.json(await subscriptions.update(id,await request.json()));
  if(method==='DELETE'&&id){await subscriptions.remove(id);return NextResponse.json({ok:true});}
  return NextResponse.json({error:'不支持该操作'},{status:405});
 }
 if(resource==='disclosures'&&id&&action==='novelty'&&path.length===3&&method==='POST')return NextResponse.json(await createDisclosureNovelty(db,id,await request.json()),{status:201});
 if(resource==='model-usage')return modelUsageEndpoint(request,path,db);
 if(resource==='disclosures')return disclosureEndpoint(request,path,new TechnicalDisclosures(db));
 if(resource==='materials'&&id&&action==='novelty'&&path.length===3&&method==='POST')return NextResponse.json(await createMaterialNovelty(db,id,await request.json()),{status:201,headers:{'Cache-Control':'no-store'}});
 if(resource==='materials'&&action==='ocr')return materialOcrEndpoint(request,path,db);
 if(resource==='materials')return materialEndpoint(request,path,new ProjectMaterials(db));
 if(resource==='workflows'&&method==='GET')return NextResponse.json({workflows:workflowCatalog()});
 if(resource==='notifications'){const notifications=new TaskNotifications(db);if(method==='GET')return NextResponse.json(await notifications.list({unread:url.searchParams.get('unread')==='1',page:z.coerce.number().int().min(1).parse(url.searchParams.get('page')||1)}));if(method==='PATCH'&&id){z.object({action:z.literal('read')}).parse(await request.json());return NextResponse.json(await notifications.markRead(id));}}
 if(resource==='report-tasks'&&method==='GET')return NextResponse.json(await new ReportTasks(db).inbox({mine:url.searchParams.get('mine')!=='0',bucket:url.searchParams.get('bucket')||'active',page:z.coerce.number().int().min(1).parse(url.searchParams.get('page')||1)}));
 if(resource==='project-labels'){
  const annotations=new ProjectAnnotations(db);
  if(method==='GET')return NextResponse.json({labels:await annotations.labels()});
  if(method==='POST')return NextResponse.json(await annotations.createLabel(await request.json()),{status:201});
  if(id&&method==='PATCH')return NextResponse.json(await annotations.renameLabel(id,await request.json()));
  if(id&&method==='DELETE'){await annotations.deleteLabel(id);return NextResponse.json({ok:true});}
 }
 if(resource==='patent-annotations'){
  const annotations=new ProjectAnnotations(db);
  if(method==='POST'&&id==='suggest'){
   const input=z.object({datasetId:z.string().min(1),patentId:z.string().min(1)}).parse(await request.json()),record=await store.patent(input.datasetId,input.patentId);
   if(!record)throw new Error('专利不存在或无访问权限');
   const suggestions=await suggestPatentLabels(record,await annotations.labels(),AbortSignal.any([request.signal,AbortSignal.timeout(60000)]));
   return NextResponse.json({suggestions,scope:{datasetId:input.datasetId,patentId:record.id,fields:['title','abstract']},saved:false});
  }
  if(method==='POST'&&id==='bulk-label')return NextResponse.json(await annotations.applyLabel(await request.json()));
  if(method==='GET'){const datasetId=url.searchParams.get('datasetId'),patentId=url.searchParams.get('patentId');if(!datasetId||!patentId)throw new Error('请选择数据集及专利');return NextResponse.json({annotations:await annotations.list(datasetId,patentId)});}
  if(method==='POST'&&!id)return NextResponse.json(await annotations.create(await request.json()),{status:201});
  if(method==='POST'&&action==='confirm')return NextResponse.json(await annotations.confirm(id));
  if(id&&method==='PATCH')return NextResponse.json(await annotations.update(id,await request.json()));
  if(id&&method==='DELETE'){await annotations.remove(id);return NextResponse.json({ok:true});}
 }
 if(resource==='professional-tasks'){
  const tasks=new ProfessionalStore(db);
  if(method==='GET'){if(!id)return NextResponse.json({tasks:await tasks.list()});const task=await tasks.get(id);return task?NextResponse.json(task):NextResponse.json({error:'专业任务不存在'},{status:404});}
  if(method==='POST'&&!id)return NextResponse.json(await tasks.create(await request.json()),{status:201});
  if(method==='POST'&&action==='prepare')return NextResponse.json(await submitProfessionalStage(db,id,modelConfig().model),{status:202});
  if(method==='POST'&&action==='retry')return NextResponse.json(await retryProfessionalStage(db,id),{status:202});
  if(method==='POST'&&action==='regenerate-report')return NextResponse.json(await regenerateProfessionalReport(db,id,modelConfig().model),{status:202});
  if(method==='POST'&&action==='artifacts'){const body=await request.json();return NextResponse.json(await tasks.propose(id,body.stage,body.data),{status:201});}
  if(method==='POST'&&action==='confirm'){const body=await request.json();return NextResponse.json(await tasks.confirm(id,body.stage,body.revision));}
 }
 const fulltext=await fulltextEndpoint(request,path);if(fulltext)return fulltext;
 const mutable=async (datasetId:string)=>{if(isDataBusy(datasetId)||(await runs()).some(r=>r.datasetId===datasetId&&r.status==='running'))throw new Error('请先停止当前数据集的数据处理或分析任务，再修改数据');};
 if(resource==='health')return NextResponse.json({ok:true,app:'invention-atlas',dataset:(await dataset()),model:modelConfig().model,modelConfigured:Boolean(modelConfig().key)});
 if(resource==='starters'&&method==='GET'){const datasetId=url.searchParams.get('dataset')||(await dataset())?.id;if(!datasetId)throw new Error('数据集不存在');const pool=(await readyStarterPool(datasetId));if(url.searchParams.get('warm')==='1'){await warmStarterPool(datasetId);return NextResponse.json((await readyStarterPool(datasetId)));}void warmStarterPool(datasetId);return NextResponse.json(pool);}
 if(resource==='starters'&&method==='POST'){
  const raw=await request.json();if(raw.action==='pool'){const input=z.object({datasetId:z.string(),consumed:z.array(z.string()).max(30).default([])}).parse(raw);const pool=(await readyStarterPool(input.datasetId,input.consumed));void warmStarterPool(input.datasetId);return NextResponse.json(pool);}
  const body=z.object({datasetId:z.string(),previous:z.array(z.string()).max(26).default([])}).parse(raw);const meta=(await dataset(body.datasetId));if(!meta)throw new Error('数据集不存在');const records=(await analysisPatents(meta.id)),encoder=new TextEncoder(),controller=new AbortController();request.signal.addEventListener('abort',()=>controller.abort(),{once:true});
  const stream=new ReadableStream({start(output){const send=(data:unknown)=>{if(!controller.signal.aborted)output.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));};void generateStarters(records,meta.id,body.previous,items=>send({items}),controller.signal).then(result=>send({...result,done:true})).catch(()=>send({done:true,error:'推荐问题生成未完成，请重试'})).finally(()=>{if(!controller.signal.aborted)output.close();});},cancel(){controller.abort();}});return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-cache','X-Accel-Buffering':'no'}});
 }
 if(resource==='entities'){const datasetId=url.searchParams.get('dataset')||(await dataset())?.id;if(!datasetId||!(await dataset(datasetId)))throw new Error('数据集不存在');const key='entities:'+datasetId;if(method==='PATCH'){if((await runs()).some(r=>r.datasetId===datasetId&&r.status==='running'))throw new Error('请等待当前数据集分析结束再改归并规则');const rules=entityRulesSchema.parse((await request.json()).rules);(await setting(key,JSON.stringify(rules)));}return NextResponse.json({rules:JSON.parse((await setting(key))||'[]')});}
 if(resource==='acquisition'&&method==='POST'){const input=acquisitionSchema.parse(await request.json()),encoder=new TextEncoder(),control=new AbortController();request.signal.addEventListener('abort',()=>control.abort(),{once:true});const stream=new ReadableStream({start(output){const send=(event:string,data:unknown)=>{if(!control.signal.aborted)output.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));};void acquireDlt(input,control.signal,data=>send('progress',data)).then(meta=>send('done',{dataset:meta})).catch(e=>send('error',{error:(e as Error).message})).finally(()=>{if(!control.signal.aborted)output.close();});},cancel(){control.abort();}});return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-cache','X-Accel-Buffering':'no'}});}
 if(resource==='evaluations'){const r=(await run(id));if(!r)throw new Error('运行不存在');if(r.status==='running')throw new Error('请在运行结束后评审');const key='evaluation:'+id;if(method==='POST'){const judgment=judgmentSchema.parse({...await request.json(),runId:id});const outcome=(await evaluateRun(r,(await analysisPatents(r.datasetId)),judgment));(await setting(key,JSON.stringify({judgment,outcome,reviewedAt:new Date().toISOString()})));return NextResponse.json({judgment,outcome});}const saved=(await setting(key));return NextResponse.json(saved?JSON.parse(saved):{outcome:(await evaluateRun(r,(await analysisPatents(r.datasetId))))});}
 if(resource==='enrichment'&&method==='POST'){const input=enrichmentSchema.parse(await request.json());await mutable(input.datasetId);claimIndex(input.datasetId);const encoder=new TextEncoder(),controller=new AbortController();request.signal.addEventListener('abort',()=>controller.abort(),{once:true});const stream=new ReadableStream({start(output){const send=(name:string,data:unknown)=>{if(!controller.signal.aborted)output.enqueue(encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`));};void enrichBatch(input,controller.signal,data=>send('progress',data)).then(results=>send('done',{results})).catch(e=>send('error',{error:(e as Error).message})).finally(()=>{releaseDataJob(input.datasetId);if(!controller.signal.aborted)output.close();});},cancel(){controller.abort();}});return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-cache','X-Accel-Buffering':'no'}});}
 if(resource==='results'){if(id){const result=(await savedResult(id));if(!result)return NextResponse.json({error:'工具结果不存在'},{status:404});return NextResponse.json(readResult(result,resultReadParameters(url.searchParams)));}return NextResponse.json({results:(await savedResults(url.searchParams.get('dataset')||(await dataset())?.id||''))});}
 if(resource==='settings'){
  if(method==='PATCH'){if((await runs()).some(r=>r.status==='running'))throw new Error('请等待正在运行的分析结束后再更改模型配置');saveModelSettings(await request.json());return NextResponse.json(publicModelSettings());}
  if(method==='POST'){const body=await request.json();const cfg=Object.keys(body).length?resolveModelSettings(body):modelConfig();await chat('只回复：连接正常','测试模型连接',{config:cfg});return NextResponse.json({ok:true,model:cfg.model});}
  if(method==='GET')return NextResponse.json(publicModelSettings());
  return NextResponse.json({error:'不支持此操作'},{status:405});
 }
 if(resource==='datasets'&&id&&action==='external-coverage'&&path.length===3){
  if(method!=='GET')return NextResponse.json({error:'仅支持读取'},{status:405});
  const reader=new ExternalReferenceReader(db);
  if(!await dataset(id))return NextResponse.json({error:'数据集不存在或没有读取权限'},{status:404});
  return NextResponse.json(await reader.coverage(id),{headers:{'Cache-Control':'no-store'}});
 }
 if(resource==='datasets'){
  if(method==='DELETE'&&id){await mutable(id);return NextResponse.json((await deleteDataset(id)));}
  if(method==='POST'&&request.headers.get('content-type')?.includes('application/json')){const body=z.object({name:z.string().trim().min(1).max(100)}).parse(await request.json());const meta=datasetMeta(body.name,[],'用户手动录入','用户新增记录；每条记录分别保留出处');(await saveDataset(meta,[]));return NextResponse.json({dataset:meta});}
  if(method==='GET')return NextResponse.json({datasets:(await datasets()),active:(await dataset())?.id});
  if(method==='PATCH'){const {id:next}=await request.json();if(!(await dataset(next)))throw new Error('数据集不存在');(await setting('active_dataset',next));return NextResponse.json({ok:true});}
  if(method==='POST'){const form=await request.formData();const files=form.getAll('files') as File[];if(!files.length)throw new Error('请添加导入文件');const format=String(form.get('format')||'canonical');const records:Patent[]=[];for(const file of files){if(file.size>32*1024*1024)throw new Error('单个文件不能超过32MB');records.push(...importText(await file.text(),format,file.name));}const unique=[...new Map(records.map(p=>[p.id,p])).values()];if(!unique.length)throw new Error('未解析到有效专利');const meta=datasetMeta(String(form.get('name')||files[0].name),unique,'用户文件导入','用户上传；请依据来源说明判断覆盖范围');(await saveDataset(meta,unique));return NextResponse.json({dataset:meta,duplicates:records.length-unique.length});}
 }
 if(resource==='index'&&method==='POST'){const meta=(await dataset((await request.json()).datasetId));if(!meta)throw new Error('数据集不存在');await mutable(meta.id);claimIndex(meta.id);if(!request.headers.get('accept')?.includes('text/event-stream'))return NextResponse.json({indexed:(await indexDataset(meta.id,request.signal,()=>{})).indexed});const encoder=new TextEncoder(),control=new AbortController();request.signal.addEventListener('abort',()=>control.abort(),{once:true});const stream=new ReadableStream({start(output){const send=(name:string,data:unknown)=>{if(!control.signal.aborted)output.enqueue(encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`));};void indexDataset(meta.id,control.signal,p=>send('progress',p)).then(d=>send('done',{dataset:d})).catch(e=>send('error',{error:(e as Error).message})).finally(()=>{if(!control.signal.aborted)output.close();});},cancel(){control.abort();}});return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-cache','X-Accel-Buffering':'no'}});}
 if(resource==='patents'&&method!=='GET'){const meta=(await dataset(url.searchParams.get('dataset')||undefined));if(!meta)throw new Error('数据集不存在');await mutable(meta.id);if(method==='POST')return NextResponse.json((await writeRecord(meta.id,await request.json())));if(method==='PATCH'&&id)return NextResponse.json((await writeRecord(meta.id,await request.json(),id)));if(method==='DELETE'){const ids=id?[id]:z.array(z.string()).min(1).parse((await request.json()).ids);return NextResponse.json((await deleteRecords(meta.id,ids)));}}
if(resource==='patents'){const meta=(await dataset(url.searchParams.get('dataset')||undefined));if(!meta)throw new Error('数据集不存在');if(id){const p=(await patent(meta.id,id));if(!p)return NextResponse.json({error:'专利不存在'},{status:404});return NextResponse.json(p);}const query=url.searchParams.get('q')||'';const page=Math.max(1,Math.floor(Number(url.searchParams.get('page'))||1));return NextResponse.json((await patentPage(meta.id,query,page,url.searchParams.get('label')?{id:url.searchParams.get('label')!,includeChildren:url.searchParams.get('includeChildren')==='true'}:undefined)));}
 if(resource==='openapi'&&method==='GET'&&path.length===1)return NextResponse.json(openApiDocument(),{headers:{'Cache-Control':'no-store'}});
 if(resource==='tools'){
  if(method==='GET'){const meta=await dataset(url.searchParams.get('dataset')||undefined);if(!meta)throw new Error('数据集不存在');const records=await analysisPatents(meta.id);return NextResponse.json({tools:TOOL_DEFS.map(([name,title,group,requiredFields])=>({name,title,group,requiredFields,...toolInformation(name),defaultParams:toolDefaults(name,records),...capability(name,records)}))});}
  if(method!=='POST'||!id||path.length!==2)return NextResponse.json({error:'工具接口不支持此操作'},{status:405});
  const body=z.object({datasetId:z.string().min(1).optional(),params:z.unknown().optional(),semantic:z.boolean().optional()}).strict().parse(await request.json());
  const step=stepSchema.parse({tool:id,params:body.params||{}}),meta=await dataset(body.datasetId??url.searchParams.get('dataset')??undefined);if(!meta)throw new Error('数据集不存在或无访问权限');
  await beginDataRead(meta.id);try{const result=await executeTool(step.tool,step.params,meta,await analysisPatents(meta.id),{entityRules:entityRulesSchema.parse(JSON.parse((await setting('entities:'+meta.id))||'[]')),semantic:body.semantic!==false,nameTopics:nameClusterTopics,signal:request.signal});await saveResult(result);return NextResponse.json({...result,contract:resultContract(result)});}finally{endDataRead(meta.id);}
 }
 if(resource==='conversations'){
  if(method==='GET'){if(id){const c=(await conversations()).find(c=>c.id===id);if(!c)return NextResponse.json({error:'对话不存在'},{status:404});const saved=(await runs(id));for(const r of saved)if(r.status==='running'&&!await isPending(r.id)){r.status='interrupted';r.error='运行进程已结束；已完成工具保留，可仅重试报告';(await saveRun(r));}return NextResponse.json({conversation:c,runs:saved});}return NextResponse.json({conversations:(await conversations())});}
  if(method==='POST'){const body=await request.json();const meta=(await dataset(body.datasetId));if(!meta)throw new Error('数据集不存在');return NextResponse.json((await newConversation(meta.id,body.title)));}
  if(method==='PATCH'){const body=await request.json();if(!String(body.title||'').trim())throw new Error('名称不能为空');await store.renameConversation(id,String(body.title).slice(0,100));return NextResponse.json({ok:true});}
  if(method==='DELETE')return NextResponse.json((await deleteSaved('conversations',id?[id]:(await request.json()).ids)));
 }
 if(resource==='runs'&&action==='budget')return modelBudgetEndpoint(request,path,db);
 if(resource==='runs'){
  if(id&&action==='followups'&&method==='POST'){
   const refresh=request.headers.get('content-type')?.includes('application/json')?Boolean((await request.json()).refresh):false;
   if(!request.headers.get('accept')?.includes('text/event-stream'))return NextResponse.json({questions:await followups(id,undefined,refresh)});
   const encoder=new TextEncoder();let closed=false;
   const stream=new ReadableStream({start(output){const send=(data:unknown)=>{if(!closed)output.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));};void followups(id,questions=>send({questions}),refresh).then(questions=>send({questions,done:true})).catch(()=>send({done:true,error:'追问生成未完成'})).finally(()=>{if(!closed){closed=true;output.close();}});},cancel(){closed=true;}});
   return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-cache','X-Accel-Buffering':'no'}});
  }
  if(method==='POST'&&!id){const body=await request.json();const question=String(body.question||'').trim();if(!question||question.length>12000)throw new Error('问题应为1至12000字符');if((await runs(body.conversationId)).some(r=>r.status==='running'))throw new Error('该对话已有任务在运行');if(body.mode==='tool'&&(!Array.isArray(body.steps)||body.steps.length!==1))throw new Error('直接工具任务必须指定一项工具');const r=(await startRun(body.conversationId,body.datasetId,question,body.steps,body.mode==='tool',body.maxModelCalls));const c=(await conversations()).find(c=>c.id===body.conversationId);if(c?.title==='新对话')await store.renameConversation(c.id,question.slice(0,40));return NextResponse.json(r,{status:202});}
  if(action==='stop'){(await stopRun(id));return NextResponse.json({ok:true});}
  if(action==='retry-report')return NextResponse.json(await retryReport(id),{status:202});
  const r=(await run(id));if(!r)return NextResponse.json({error:'运行不存在'},{status:404});
  if(action==='events'){
   let after=Number(url.searchParams.get('after')||0),closed=false;const encoder=new TextEncoder();let timer:ReturnType<typeof setTimeout>;
   const stream=new ReadableStream({start(controller){const poll=async ()=>{if(closed)return;try{if(!(await currentSession(request))){closed=true;controller.close();return;}const batch=await events(id,after);if(closed)return;for(const e of batch){after=e.seq;controller.enqueue(encoder.encode(`id: ${e.seq}\nevent: ${e.event}\ndata: ${e.payload}\n\n`));}if((await run(id))?.status!=='running'){closed=true;controller.close();return;}timer=setTimeout(poll,250);}catch(error){if(!closed){closed=true;controller.error(error);}}};void poll();request.signal.addEventListener('abort',()=>{closed=true;clearTimeout(timer);try{controller.close();}catch{}},{once:true});},cancel(){closed=true;clearTimeout(timer);}});
   return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-cache','X-Accel-Buffering':'no'}});
  }
  return NextResponse.json(r);
 }
 if(resource==='reports'){
  if(action==='publications'&&(!id||!['GET','POST'].includes(method)||(method==='POST'&&path[3])))return NextResponse.json({error:'发布接口不支持此操作'},{status:405});
  if(id&&action==='publications'){
   const publications=new ReportPublications(db);
   if(method==='POST')return NextResponse.json(await publications.publish(id,await request.json()),{status:201});
   if(!path[3])return NextResponse.json({publications:await publications.list(id)});
   const published=await publications.read(id,z.coerce.number().int().positive().parse(path[3]));
   if(path[4]==='pdf')return new Response(new Uint8Array(await exportReportPdf(published)),{headers:{'Content-Type':'application/pdf','Cache-Control':'no-store','Content-Disposition':`attachment; filename="patent-report-${id}-edition-${path[3]}.pdf"`}});
   if(path[4]==='docx')return new Response(new Uint8Array(await exportReportDocx(published)),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','Cache-Control':'no-store','Content-Disposition':`attachment; filename="patent-report-${id}-edition-${path[3]}.docx"`}});
   if(path[4]==='html'||path[4]==='view')return new Response(exportReportHtml(published),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Disposition':`${path[4]==='view'?'inline':'attachment'}; filename="patent-report-${id}-edition-${path[3]}.html"`}});
   return NextResponse.json(published);
  }
if(id&&action==='tasks'){const tasks=new ReportTasks(db);if(method==='GET'&&path[3]==='candidates')return NextResponse.json({candidates:await tasks.candidates()});if(method==='GET')return NextResponse.json({tasks:await tasks.list(id,z.coerce.number().int().min(0).parse(url.searchParams.get('version')||0))});if(method==='POST')return NextResponse.json(await tasks.create(id,await request.json()),{status:201});if(path[3]&&method==='PATCH'){const body=await request.json();return NextResponse.json(body.action==='reassign'?await tasks.reassign(id,path[3],body):await tasks.update(id,path[3],body));}}
  if(id&&action==='shares'){const shares=new ReportShares(db);if(method==='GET'&&path[3]==='recipients')return NextResponse.json({recipients:await shares.recipients()});if(method==='GET')return NextResponse.json({shares:await shares.list(id)});if(method==='POST')return NextResponse.json(await shares.create(id,await request.json()),{status:201});if(path[3]&&method==='DELETE')return NextResponse.json(await shares.revoke(id,path[3]));}
  if(id&&action==='comments'){const comments=new ReportComments(db);if(method==='GET')return NextResponse.json({comments:await comments.list(id,z.coerce.number().int().min(0).parse(url.searchParams.get('version')||0))});if(method==='POST')return NextResponse.json(await comments.create(id,await request.json()),{status:201});if(path[3]&&method==='PATCH')return NextResponse.json(await comments.update(id,path[3],await request.json()));if(path[3]&&method==='DELETE'){await comments.remove(id,path[3]);return NextResponse.json({ok:true});}}
  if(id&&action==='compare'&&method==='GET')return NextResponse.json(await new ReportVersions(db).compare(id,z.coerce.number().int().min(0).parse(url.searchParams.get('from')||0),z.coerce.number().int().min(0).parse(url.searchParams.get('to')||0)));
  if(id&&action==='versions'){const versions=new ReportVersions(db);if(method==='GET')return NextResponse.json(await versions.list(id));if(method==='POST')return NextResponse.json(await versions.save(id,await request.json()),{status:201});}
  if(method==='DELETE')return NextResponse.json((await deleteSaved('reports',id?[id]:(await request.json()).ids)));
  if(method==='POST'){const body=await request.json();const r=(await run(body.runId));if(!r||!r.results.length||r.status==='running')throw new Error('请选择已结束且有工具结果的运行');return NextResponse.json({id:(await saveReport(r,String(body.title||r.question.slice(0,60))))});}
  if(!id)return NextResponse.json({reports:await reports()});const revision=z.coerce.number().int().min(0).parse(url.searchParams.get('version')||0);const report=await new ReportVersions(db).snapshot(id,revision);const snapshot=report.run;const exportedAnswer=(revision?'# '+report.title+'\n\n人工编辑草稿；正文与引用需核对。\n\n':'')+snapshot.answer.replace(/\[\[chart:([^\]]+)\]\]/g,(_,id)=>'【工具结果：'+(snapshot.results.find(r=>r.id===id)?.title||'未保存')+'】');
  if(action==='markdown')return new Response(exportedAnswer,{headers:{'Content-Type':'text/markdown; charset=utf-8','Content-Disposition':`attachment; filename="patent-report-${id}.md"`}});
  if(action==='html')return new Response(exportReportHtml(report),{headers:{'Content-Type':'text/html; charset=utf-8','Content-Disposition':`attachment; filename="patent-report-${id}.html"`}});
  if(action==='docx')return new Response(new Uint8Array(await exportReportDocx(report)),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','Cache-Control':'no-store','Content-Disposition':`attachment; filename="patent-report-${id}-version-${revision}.docx"`}});
  if(action==='pdf')return new Response(new Uint8Array(await exportReportPdf(report)),{headers:{'Content-Type':'application/pdf','Cache-Control':'no-store','Content-Disposition':`attachment; filename="patent-report-${id}-version-${revision}.pdf"`}});
  return NextResponse.json(report);
 }
 return NextResponse.json({error:'接口不存在'},{status:404});
 }catch(e){return NextResponse.json({error:e instanceof z.ZodError?e.issues[0]?.message||'请检查输入字段':(e as Error).message||'请求失败'},{status:400});}}
async function handle(request:Request,context:{params:Promise<{path:string[]}>}){try{
 const {path}=await context.params;
 if(path[0]==='ocr-settings'&&path.length===1){const session=await currentSession(request);if(!session)return NextResponse.json({error:'请先登录'},{status:401});if(session.platformRole!=='admin')return NextResponse.json({error:'需要平台管理员权限'},{status:403});const headers={'Cache-Control':'no-store'};if(request.method==='GET')return NextResponse.json({settings:publicMineruSettings()},{headers});if(request.method==='PATCH')return NextResponse.json({settings:saveMineruSettings(await request.json())},{headers});return NextResponse.json({error:'不支持该操作'},{status:405});}
 if(request.headers.has('authorization'))return await apiCredentialRequest(request,path,()=>withOrganizationModel(db,()=>resources(request,context)));const response=await identityEndpoint(request,path);
 if(!response&&path[0]==='shared-reports'&&request.method==='GET'){
  const session=await currentSession(request);if(!session)return NextResponse.json({error:'请先登录'},{status:401});
return await withAccess({userId:session.id,organizationId:'',projectId:''},async()=>{const shares=new ReportShares(db);if(!path[1])return NextResponse.json({reports:await shares.received()});const snapshot=await shares.read(path[1]);if(path[2]==='html'||path[2]==='view')return new Response(exportReportHtml(snapshot),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',...(path[2]==='html'?{'Content-Disposition':'attachment; filename="shared-report.html"'}:{})}});return NextResponse.json(snapshot);});
 }
 return response||await projectRequest(request,path,async()=>{
  if(path[0]==='organization-model'&&path.length===1){const models=new OrganizationModel(db);if(request.method==='GET')return NextResponse.json({settings:await models.read()},{headers:{'Cache-Control':'no-store'}});if(request.method==='PUT'||request.method==='PATCH')return NextResponse.json({settings:await models.save(await request.json())},{headers:{'Cache-Control':'no-store'}});if(request.method==='DELETE'){await models.remove();return NextResponse.json({ok:true});}return NextResponse.json({error:'不支持该操作'},{status:405});}
  return withOrganizationModel(db,()=>resources(request,context));
 });
 }catch(e){return NextResponse.json({error:e instanceof z.ZodError?e.issues[0]?.message||'请检查输入字段':(e as Error).message||'请求失败'},{status:400});}}
export {handle as GET,handle as POST,handle as PATCH,handle as DELETE};
