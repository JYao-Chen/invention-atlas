import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {BaseChatModel} from '@langchain/core/language_models/chat_models';
import {AIMessage,HumanMessage,type BaseMessage} from '@langchain/core/messages';
import {emptyCheckpoint} from '@langchain/langgraph-checkpoint';
import {postgresPool,withAccess,type AccessScope} from '../src/server/postgres';
import {IdentityStore} from '../src/server/identity';
import {PostgresStore} from '../src/server/postgres-store';
import {DeepResearchStore,assembleResearchReport,researchInput,outlineSchema} from '../src/server/deep-research-store';
import {ResearchCheckpointer} from '../src/server/research-checkpointer';
import {executeDeepResearch} from '../src/server/deep-research-engine';
import {normalize,datasetMeta} from '../src/server/importers';
import {withModelSettings} from '../src/server/config';
import {ModelBudget} from '../src/server/model-budget';
import {executeTool} from '../src/server/tools';
import {researchEditorialIssues} from '../src/server/research-editorial';
import {withModelRun} from '../src/server/model-usage';

class ScriptedModel extends BaseChatModel{
 step=0;calls:{name:string;args:Record<string,unknown>}[]=[];
 constructor(private readonly script:(step:number,messages:BaseMessage[])=>{name:string;args:Record<string,unknown>}){super({});}
 _llmType(){return 'research-test';}
 bindTools(){return this;}
 async _generate(messages:BaseMessage[]){const call=this.script(this.step++,messages);this.calls.push(call);return {generations:[{text:'',message:new AIMessage({content:call.name==='end_naturally'?'已整理当前发现。':'',tool_calls:call.name==='end_naturally'?[]:[{id:'call_'+this.step,type:'tool_call',...call}],usage_metadata:{input_tokens:10,output_tokens:10,total_tokens:20}})}]};}
}
const outline=[{id:'overview',title:'数据与技术全景',question:'技术全景如何？',targetWords:500},{id:'directions',title:'研发方向',question:'下一步研究什么？',targetWords:500}];
const prose='研究数据展示了技术措施与应用目标之间的联系。通过逐项阅读公开文本，可以比较不同方案的设计与技术效果，并结合分析结果进一步确定研究方向。'.repeat(8);

test('deep report defaults to outline confirmation and preserves dynamic chapter ids',()=>{
 assert.equal(researchInput.parse({datasetId:'d',goal:'研究技术路线'}).mode,'confirm_outline');
 assert.equal(outlineSchema.safeParse([outline[0],outline[0]]).success,false);
});

test('native Deep Agents pauses for edited outline, resumes tools and saves revised chapters and report under project RLS',async()=>{
 const admin=postgresPool(process.env.DATABASE_URL),identity=new IdentityStore(admin),role='research_'+randomUUID().replaceAll('-','');let runtime:ReturnType<typeof postgresPool>|undefined;
 const schema=(await admin.query('SELECT current_schema() schema')).rows[0].schema;
 try{
  const record=normalize({id:'US9021001B1',title:'Synthetic identity verification',abstract:'A digital identity verification system.',description:'Original description of identity verification.',claims:[{number:1,text:'A digital verification apparatus.'}],publication_date:'2024-01-01',applicants:['Test A'],ipc:['H04L9/00']},'UNIT TEST ONLY');
  const meta=datasetMeta('深度报告测试',[record],'unit-test','fixture');await new PostgresStore(admin).saveDataset(meta,[record]);
  const initialized=await identity.initializeAdmin('research-owner','research-password-123','Research test');
  const readerInvite=await identity.createInvite(initialized.user!.id,initialized.organizationId),reader=await identity.registerInvitation(readerInvite.token,'research-reader','research-password-123','Reader');
  await identity.setProjectMember(initialized.user!.id,initialized.projectId,reader.user.id,'reader');
  const foreignOrg=await identity.createOrganization(initialized.user!.id,'Other org'),foreignProject=await identity.createProject(initialized.user!.id,foreignOrg.id,'Other project');
  await admin.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS`);await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);await admin.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${role}`);await admin.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO ${role}`);
  const url=new URL(process.env.DATABASE_URL!);url.username=role;url.password='';runtime=postgresPool(url.toString());
  const pool=runtime,scope:AccessScope={userId:initialized.user!.id,organizationId:initialized.organizationId,projectId:initialized.projectId},tasks=new DeepResearchStore(pool),store=new PostgresStore(pool);
  await withAccess(scope,async()=>{
   const task=await tasks.create({datasetId:meta.id,goal:'研究身份认证技术路线',targetWords:1000,maxModelCalls:30},'test');
   let sourceId='';
   const model=new ScriptedModel((step,messages)=>{
    if(step===5)sourceId=JSON.parse(String(messages.at(-1)!.content)).evidenceId;
    const calls=[{name:'research_state',args:{}},{name:'run_analysis',args:{name:'get_dataset_summary',params:{}}},{name:'propose_outline',args:{title:'身份认证研究',outline}},{name:'confirm_outline',args:{}},
     {name:'read_patent',args:{patentId:record.id,field:'abstract',offset:0,length:6000}},
     {name:'write_chapter',args:{chapterId:'overview',body:prose+' [[source:'+sourceId+']]',findings:'技术与身份认证有关',evidenceIds:[sourceId]}},
     {name:'write_chapter',args:{chapterId:'directions',body:prose,findings:'进一步比较认证流程',evidenceIds:[]}},
     {name:'write_chapter',args:{chapterId:'overview',body:prose+'经过跨章比较后修订。 [[source:'+sourceId+']]',findings:'比较完成并修订',evidenceIds:[sourceId]}},
     {name:'finish_report',args:{}}];
    assert.ok(calls[step], 'agent continued after finish_report');return calls[step];
   });
   const execute=()=>withModelRun(task.id,async()=>executeDeepResearch(pool,(await store.run(task.id))!,new AbortController().signal,{model}));
   await execute();assert.equal(model.step,4);assert.equal((await tasks.get(task.id))!.status,'awaiting_outline');
   const checkpointer=new ResearchCheckpointer(pool,task.id),cp=await checkpointer.getTuple({configurable:{thread_id:task.id}});assert.ok(cp);assert.ok(cp.pendingWrites?.length);
   const history=[];for await(const entry of checkpointer.list({configurable:{thread_id:task.id}},{limit:2}))history.push(entry);assert.equal(history.length,2);
   await pool.query("UPDATE jobs SET state='completed' WHERE run_id=$1",[task.id]);
   const edited=outline.map((c,i)=>i===0?{...c,title:'用户确认的数据与全景'}:c);await tasks.resume(task.id,true,edited);await tasks.feedback(task.id,'增加跨章比较');
   await execute();const completed=(await tasks.get(task.id))!;assert.equal(completed.status,'completed');assert.ok(completed.report_id);assert.equal(completed.outline[0].title,edited[0].title);assert.equal(completed.chapters?.length,2);
   assert.equal((await tasks.versions(task.id,'overview')).length,2);assert.equal(completed.chapters?.find(c=>c.id==='overview')?.revision,2);
   const report=(await store.reports()).find(r=>r.id===completed.report_id)!;assert.ok(report.run.answer.includes('用户确认的数据与全景'));assert.ok(report.run.answer.includes('[1]'));assert.ok(report.run.answer.includes('资料来源'));assert.ok(report.run.answer.includes('经过跨章比较后修订'));assert.equal(report.run.results.length,1);
   await assert.rejects(tasks.chapter(task.id,'overview',prose,'unsupported',['unknown-evidence']),/尚未登记/);
   await assert.rejects(tasks.outline(task.id,'new title',[{...outline[0],id:'replacement'},outline[1]]),/保留编号/);
   const readScope={...scope,userId:reader.user.id};assert.equal((await withAccess(readScope,()=>tasks.get(task.id)))?.chapters?.length,2);await withAccess(readScope,()=>tasks.feedback(task.id,'reader feedback'));assert.equal((await tasks.get(task.id))!.feedback.length,1);await assert.rejects(withAccess(readScope,()=>tasks.chapter(task.id,'overview',prose,'reader',[])),/提纲|权限|row-level/);
   const foreignScope={...scope,organizationId:foreignOrg.id,projectId:foreignProject.id};assert.equal(await withAccess(foreignScope,()=>tasks.get(task.id)),undefined);assert.equal(await withAccess(foreignScope,()=>new ResearchCheckpointer(pool,task.id).getTuple({configurable:{thread_id:task.id}})),undefined);
   // Full automation continues after a natural-language stop and survives a budget stop.
   const automatic=await tasks.create({datasetId:meta.id,goal:'全自动完成技术研究',mode:'automatic',targetWords:1000,maxModelCalls:10},'test');
   const automaticModel=new ScriptedModel(step=>[
    {name:'run_analysis',args:{name:'analyze_patent_reading',params:{patent_numbers:[record.id]}}},
    {name:'run_analysis',args:{name:'get_dataset_summary',params:{}}},
    {name:'propose_outline',args:{title:'自动研究',outline}},
    {name:'write_chapter',args:{chapterId:'overview',body:prose,findings:'已完成概况研究',evidenceIds:[]}},
    {name:'end_naturally',args:{}},
    {name:'write_chapter',args:{chapterId:'directions',body:prose,findings:'形成研究方向',evidenceIds:[]}},
    {name:'finish_report',args:{}},
   ][step]);
   await new ModelBudget(pool).set(automatic.id,2);
   const automaticExecute=()=>withModelRun(automatic.id,async()=>executeDeepResearch(pool,(await store.run(automatic.id))!,new AbortController().signal,{model:automaticModel,execute:async(name,input,meta,records,context)=>{if(name==='analyze_patent_reading')throw new Error('阅读底稿引文不能定位到原文');return executeTool(name,input,meta,records,context);}}));
   await assert.rejects(automaticExecute(),/预算上限/);assert.equal((await tasks.get(automatic.id))!.status,'paused');assert.equal(automaticModel.step,2);
   assert.equal((await new ModelBudget(pool).read(automatic.id)).started_calls,2);
   await new ModelBudget(pool).set(automatic.id,10);await tasks.resume(automatic.id);await automaticExecute();
   const autoCompleted=(await tasks.get(automatic.id))!;assert.equal(autoCompleted.status,'completed');assert.equal(autoCompleted.chapters?.length,2);assert.equal(automaticModel.step,7);const failedId=(await store.run(automatic.id))!.results.find(r=>r.status==='failed')!.id;assert.ok(!autoCompleted.evidence?.some(e=>e.id===failedId));
   assert.equal((await new ModelBudget(pool).read(automatic.id)).started_calls,7);
   // Exercise the real ChatOpenAI tool binding and HTTP path: configuration
   // cloning must neither lose the meter nor issue a request past the budget.
   const native=await tasks.create({datasetId:meta.id,goal:'真实模型适配器预算测试',mode:'automatic',targetWords:1000,maxModelCalls:10},'adapter-test');
   let requests=0;const serverErrors:string[]=[];
   const nativeCalls=[
    {name:'run_analysis',args:{name:'get_dataset_summary',params:{}}},
    {name:'propose_outline',args:{title:'HTTP适配器研究',outline}},
    {name:'write_chapter',args:{chapterId:'overview',body:prose,findings:'HTTP主流程写入完成',evidenceIds:[]}},
    {name:'write_chapter',args:{chapterId:'directions',body:prose,findings:'中断后完成下一章',evidenceIds:[]}},
    {name:'finish_report',args:{}},
   ];
   const server=createServer(async(request,response)=>{
    try{
     let raw='';for await(const chunk of request)raw+=chunk;const payload=JSON.parse(raw);assert.equal(payload.stream,false);
     const call=nativeCalls[requests++];assert.ok(call,'unexpected HTTP model request');
     response.writeHead(200,{'Content-Type':'application/json'});response.end(JSON.stringify({id:'chatcmpl-test-'+requests,object:'chat.completion',created:1,model:'adapter-test',choices:[{index:0,finish_reason:'tool_calls',message:{role:'assistant',content:null,tool_calls:[{id:'native-call-'+requests,type:'function',function:{name:call.name,arguments:JSON.stringify(call.args)}}]}}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}}));
    }catch(error){serverErrors.push(String(error));response.writeHead(500,{'Content-Type':'application/json'});response.end(JSON.stringify({error:{message:String(error)}}));}
   });
   await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
   try{
    const port=(server.address() as {port:number}).port;
    const nativeExecute=()=>withModelSettings({model:'adapter-test',base:'http://127.0.0.1:'+port+'/v1',apiKey:'fixture'},()=>withModelRun(native.id,async()=>executeDeepResearch(pool,(await store.run(native.id))!,new AbortController().signal)));
    await new ModelBudget(pool).set(native.id,3);await assert.rejects(nativeExecute(),/预算上限/);
    assert.equal(requests,3);assert.equal((await tasks.get(native.id))!.status,'paused');assert.equal((await tasks.get(native.id))!.chapters?.length,1);
    await new ModelBudget(pool).set(native.id,10);await tasks.resume(native.id);await nativeExecute();
    assert.equal(requests,5);assert.equal((await tasks.get(native.id))!.status,'completed');assert.equal((await tasks.versions(native.id,'overview')).length,1);
    assert.equal((await new ModelBudget(pool).read(native.id)).started_calls,5);
    assert.equal(Number((await admin.query('SELECT count(*) n FROM model_usage WHERE run_id=$1',[native.id])).rows[0].n),5);assert.deepEqual(serverErrors,[]);
   }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
   // Serialized messages must return as native objects, not plain JSON data.
   const isolated=await tasks.create({datasetId:meta.id,goal:'序列化研究状态',mode:'automatic',targetWords:1000},'test'),saver=new ResearchCheckpointer(pool,isolated.id),checkpoint=emptyCheckpoint();
   checkpoint.channel_values={messages:[new HumanMessage('保存原文')]};const cfg=await saver.put({configurable:{thread_id:isolated.id}},checkpoint,{source:'input',step:0,parents:{}});
   await saver.putWrites(cfg,[['messages',new AIMessage('保留消息类型')]],'writer','1');const restored=await new ResearchCheckpointer(pool,isolated.id).getTuple(cfg);assert.ok((restored!.checkpoint.channel_values.messages as HumanMessage[])[0] instanceof HumanMessage);assert.ok(restored!.pendingWrites![0][2] instanceof AIMessage);
   await tasks.pause(isolated.id);assert.equal((await tasks.get(isolated.id))!.status,'paused');await tasks.resume(isolated.id);assert.equal((await tasks.get(isolated.id))!.status,'queued');
  });
 }finally{if(runtime)await runtime.end();await admin.query(`DROP OWNED BY ${role}`).catch(()=>{});await admin.query(`DROP ROLE IF EXISTS ${role}`);await admin.end();}
});

test('long report assembly keeps chapter bodies, ordering and missing chapters visible as an error',()=>{
 const task={id:'t',title:'长篇研究',outline,input:{datasetId:'d',goal:'研究',mode:'automatic' as const,targetWords:30000,maxModelCalls:120},status:'running' as const,outline_confirmed:true,feedback:[],error:'',report_id:null,updated_at:'',evidence:[],chapters:[{id:'overview',body:'甲'.repeat(16000),findings:'',revision:1,evidence_ids:[],updated_at:''},{id:'directions',body:'乙'.repeat(16000),findings:'',revision:1,evidence_ids:[],updated_at:''}]};
 const body=assembleResearchReport(task);assert.ok(body.length>32000);assert.ok(body.indexOf('甲')<body.indexOf('乙'));assert.throws(()=>assembleResearchReport({...task,chapters:task.chapters.slice(0,1)}),/尚未完成/);
});

test('research writing removes requested disclaimer patterns while retaining substantive negative findings',()=>{
 assert.ok(researchEditorialIssues('## 字段覆盖：状态字段缺失\nlegalStatus 覆盖率为0，因此不涉及法律判断。').length);
 assert.ok(researchEditorialIssues('这种形态描述本语料，而非整个行业。').length);
 assert.ok(researchEditorialIssues('方法与数据限制说明：需要人工复核，仅供参考。').length);
 assert.deepEqual(researchEditorialIssues('2018年公开11件，2019年公开1件。申请人采用名称计数；同一公开件可以计入多个申请人。没有形成单一主体优势。'),[]);
});
