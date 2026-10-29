import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import type {Run,AnalysisResult,ConclusionReview} from '../src/lib/types';
import {postgresPool,migratePostgres,withAccess,connection,transaction,type AccessScope} from '../src/server/postgres';
import {PostgresStore} from '../src/server/postgres-store';
import {IdentityStore} from '../src/server/identity';
import {ReportReviews,reviewStatistics,reviewDecisionSchema} from '../src/server/report-reviews';
import {ReportVersions} from '../src/server/report-versions';
import {reportConclusions} from '../src/server/report-conclusions';
import {RetrievalExperiments,retrievalMetrics,retrievalExperimentSchema} from '../src/server/retrieval-experiments';
import {humanAiReviewEndpoint} from '../src/server/human-ai-review-api';
import {normalize,datasetMeta} from '../src/server/importers';
import {openApiDocument} from '../src/server/openapi';

const result:AnalysisResult={id:'result-one',tool:'get_dataset_summary',title:'统计',status:'completed',datasetId:'dataset',params:{},summary:'统计',rows:[{patent:'US123001B1',count:3}],warnings:[],method:'fixture',evidence:['US123001B1'],createdAt:'2026-10-29T00:00:00Z'};
test('paragraph anchors preserve immutable snapshots, precise evidence and occurrence-aware revision links',()=>{
 const answer='## 发现\n\nUS123001B1 有 3 项。\n\n[[chart:result-one]]\n\n没有来源的判断。\n\n- 重复段落\n- 重复段落';
 const original=reportConclusions('r',0,answer,[result]);assert.equal(original.length,4);
 assert.deepEqual(original[0].resultIds,['result-one']);assert.deepEqual(original[0].patentNumbers,['US123001B1']);assert.deepEqual(original[1].tools,[]);
 const revised=reportConclusions('r',1,answer.replace('没有来源的判断。','人工改写。'),[result],original);
 assert.equal(revised[0].previousId,original[0].id);assert.equal(revised[1].previousId,undefined);
 assert.equal(revised[2].previousId,original[2].id);assert.equal(revised[3].previousId,original[3].id);
 assert.notEqual(revised[0].id,original[0].id);assert.deepEqual(reportConclusions('r',0,answer,[result]),original);
 const inline=reportConclusions('r',0,'US123001B1 见 [[chart:ab12-cd34-ef56]]。',[{...result,id:'ab12-cd34-ef56'}]);assert.deepEqual(inline[0].patentNumbers,['US123001B1']);
});
test('review statistics use latest submitted review per person and conclusion; durations and multi-tool groups are explicit',()=>{
 const conclusions=reportConclusions('r',0,'## 发现\n\n第一段。\n\n第二段。\n\n第三段。',[result]);conclusions[0].tools=['a','b'];conclusions[1].tools=['a'];
 const make=(id:string,index:number,decision:ConclusionReview['decision'],seconds:number,submittedSeconds:number):ConclusionReview=>({id,report_id:'r',revision:0,conclusion_id:conclusions[index].id,conclusion:conclusions[index],reviewer_id:'user',started_at:new Date(submittedSeconds*1000-seconds*1000),submitted_at:new Date(submittedSeconds*1000),decision,reason:'依据',modified_text:decision==='modify'?'改写':null,evidence:{patentNumbers:[],resultIds:[]}});
 const rows=[make('obsolete',0,'reject',100,100),make('latest',0,'accept',10,200),make('modify',1,'modify',20,200),make('reject',2,'reject',30,200),{...make('pending',0,null,100,300),submitted_at:null}];
 const stats=reviewStatistics(rows),report=stats.find(g=>g.dimension==='report')!;
 assert.equal(report.count,3);assert.equal(report.acceptRate,1/3);assert.equal(report.modifyRate,1/3);assert.equal(report.rejectRate,1/3);assert.equal(report.averageDurationMs,20000);
 assert.equal(stats.find(g=>g.dimension==='tool'&&g.key==='a')?.averageDurationMs,15000);assert.equal(stats.find(g=>g.key==='b')?.count,1);
 assert.deepEqual(reviewStatistics([]),[]);
 assert.throws(()=>reviewDecisionSchema.parse({decision:'reject'}));assert.throws(()=>reviewDecisionSchema.parse({decision:'modify',reason:'修改'}));assert.throws(()=>reviewDecisionSchema.parse({decision:'accept',modifiedText:'误填'}));
});
test('retrieval precision and recall use normalized unique reference numbers with explicit empty denominators',()=>{
 const metrics=retrievalMetrics(['us-123-b1','US123B1','US456B1'],['US123B1','US789B1','US789B1','US999B1']);assert.equal(metrics.truePositives,1);assert.equal(metrics.precision,0.5);assert.equal(metrics.recall,1/3);
 assert.equal(retrievalMetrics([],['US123B1']).precision,null);assert.equal(retrievalMetrics([],['US123B1']).recall,0);assert.equal(retrievalMetrics(['US123B1'],[]).recall,null);
 assert.throws(()=>retrievalExperimentSchema.parse({datasetId:'d',method:'ai',query:'x',startedAt:'2026-10-29T01:00:00Z',endedAt:'2026-10-29T00:00:00Z',patentNumbers:[]}));
});

test('044 is repeatable; non-owner RLS enforces reader/writer and same-organization cross-project boundaries',async()=>{
 const admin=postgresPool(),identity=new IdentityStore(admin),legacy=new PostgresStore(admin),role='review_'+randomUUID().replaceAll('-','');let runtime:ReturnType<typeof postgresPool>|undefined;
 const schema=(await admin.query('SELECT current_schema() schema')).rows[0].schema;
 try{
  await migratePostgres(admin);const migration=await readFile('migrations/044_human_ai_review.sql','utf8');await admin.query(migration);await admin.query(migration);
  const p=normalize({id:'US123001B1',title:'Fixture',abstract:'Synthetic'},'TEST'),meta=datasetMeta('Review fixture',[p],'fixture','fixture');await legacy.saveDataset(meta,[p]);
  const alpha=await identity.initializeAdmin('review-owner','review-password-123','Review org'),owner:AccessScope={userId:alpha.user!.id,organizationId:alpha.organizationId,projectId:alpha.projectId};
  const other=await identity.createProject(owner.userId,owner.organizationId,'Other project'),foreign={...owner,projectId:other.id};
  const members:AccessScope[]=[];
  for(const memberRole of ['reader','analyst'] as const){const invite=await identity.createInvite(owner.userId,owner.organizationId),member=await identity.registerInvitation(invite.token,'review-'+memberRole,'review-password-123',memberRole);await identity.setProjectMember(owner.userId,owner.projectId,member.user.id,memberRole);members.push({...owner,userId:member.user.id});}
  const [reader,writer]=members;
  await admin.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS`);await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);await admin.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${role}`);await admin.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO ${role}`);
  const url=new URL(process.env.DATABASE_URL!);url.username=role;url.password='';runtime=postgresPool(url.toString());
  const store=new PostgresStore(runtime),reviews=new ReportReviews(runtime),versions=new ReportVersions(runtime),experiments=new RetrievalExperiments(runtime);
  const conversation=await withAccess(writer,()=>store.newConversation(meta.id));
  const run:Run={id:randomUUID(),conversationId:conversation.id,datasetId:meta.id,question:'Fixture',status:'completed',plan:[],results:[{...result,datasetId:meta.id}],answer:'## 发现\n\nUS123001B1 有 3 项。\n\n保留段落。',error:'',model:'mock',createdAt:new Date().toISOString()};
  await withAccess(writer,()=>store.saveRun(run));const reportId=await withAccess(writer,()=>store.saveReport(run,'Fixture'));
  const original=await withAccess(reader,()=>reviews.conclusions(reportId));assert.equal(original.length,2);
  const start={revision:0,conclusionId:original[0].id};
  await assert.rejects(withAccess(reader,()=>reviews.start(reportId,start)),{code:'42501'});
  await assert.rejects(withAccess(foreign,()=>reviews.conclusions(reportId)),/不存在/);
  await assert.rejects(withAccess(foreign,()=>reviews.start(reportId,start)),/不存在/);
  const pending=await withAccess(writer,()=>reviews.start(reportId,start));assert.equal(pending.reviewer_id,writer.userId);assert.equal(pending.decision,null);
  await assert.rejects(withAccess(owner,()=>reviews.submit(reportId,pending.id,{decision:'accept'})),/无提交权限/);
  await assert.rejects(withAccess(reader,()=>reviews.submit(reportId,pending.id,{decision:'accept'})),/无提交权限/);
  await assert.rejects(withAccess(writer,()=>reviews.submit(reportId,pending.id,{decision:'modify',reason:'原结论夸大'})),/修改后文本/);
  await assert.rejects(withAccess(writer,()=>reviews.submit(reportId,pending.id,{decision:'accept',evidence:{resultIds:['other-run']}})),/不属于报告快照/);
  const submitted=await withAccess(writer,()=>reviews.submit(reportId,pending.id,{decision:'modify',reason:'缩小范围',modifiedText:'人工限定后的结论',evidence:{resultIds:['result-one'],patentNumbers:['US123001B1']}}));assert.equal(submitted.modified_text,'人工限定后的结论');assert.ok(+new Date(submitted.submitted_at!)>=+new Date(submitted.started_at));
  await assert.rejects(withAccess(writer,()=>reviews.submit(reportId,pending.id,{decision:'reject',reason:'重复提交'})),/已提交/);
  assert.equal((await withAccess(writer,()=>connection(runtime!).query('DELETE FROM report_conclusion_reviews WHERE id=$1',[pending.id]))).rowCount,0);
  await withAccess(writer,()=>versions.save(reportId,{expectedRevision:0,title:'修订',answer:run.answer.replace('有 3 项','有三项')}));
  const revised=await withAccess(reader,()=>reviews.conclusions(reportId,1));assert.equal(revised[0].previousId,undefined);assert.equal(revised[1].previousId,original[1].id);
  assert.deepEqual(await withAccess(reader,()=>reviews.conclusions(reportId)),original);assert.equal((await withAccess(reader,()=>reviews.list(reportId)))[0].conclusion.text,original[0].text);
  assert.equal((await withAccess(reader,()=>reviews.statistics(reportId))).groups.find(g=>g.dimension==='report')?.modifyRate,1);
  const request=(method:string,path:string,body?:unknown)=>new Request('http://localhost/api/'+path,{method,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
  assert.equal((await withAccess(reader,()=>humanAiReviewEndpoint(request('GET','reports/'+reportId+'/conclusions'),['reports',reportId,'conclusions'],runtime!)))?.status,200);
  assert.equal((await withAccess(writer,()=>humanAiReviewEndpoint(request('DELETE','reports/'+reportId+'/reviews'),['reports',reportId,'reviews'],runtime!)))?.status,405);
  const input={datasetId:meta.id,method:'manual_boolean',query:'sensor AND identity',startedAt:'2026-10-29T00:00:00Z',endedAt:'2026-10-29T00:01:00Z',patentNumbers:['US123001B1','US456001B1']};
  await assert.rejects(withAccess(reader,()=>experiments.create(input)),{code:'42501'});await assert.rejects(withAccess(foreign,()=>experiments.create(input)),/数据集不存在/);
  const experiment=await withAccess(writer,()=>experiments.create(input));assert.equal(experiment.operator_id,writer.userId);assert.equal(Number(experiment.duration_ms),60000);
  const measured=await withAccess(reader,()=>experiments.compare(experiment.id,{referencePatentNumbers:['US123001B1','US987001B1']}));assert.equal(measured.recall,0.5);assert.equal(measured.precision,0.5);
  assert.equal((await withAccess(reader,()=>experiments.list())).length,1);assert.deepEqual(await withAccess(foreign,()=>experiments.list()),[]);await assert.rejects(withAccess(foreign,()=>experiments.get(experiment.id)),/不存在/);
  assert.deepEqual((await withAccess(foreign,()=>connection(runtime!).query('SELECT * FROM report_conclusion_reviews'))).rows,[]);
  const doc=openApiDocument();for(const path of ['/reports/{id}/conclusions','/reports/{id}/reviews','/reports/{id}/reviews/{reviewId}','/reports/{id}/review-statistics','/retrieval-experiments','/retrieval-experiments/{id}','/retrieval-experiments/{id}/compare'])assert.ok(doc.paths[path]);
  await withAccess(writer,()=>transaction(runtime!,async client=>{await client.query('DELETE FROM patents WHERE dataset_id=$1',[meta.id]);await client.query('DELETE FROM datasets WHERE id=$1',[meta.id]);}));
  assert.equal((await withAccess(reader,()=>experiments.get(experiment.id))).dataset_id,meta.id);assert.equal((await withAccess(reader,()=>reviews.conclusions(reportId))).length,2);
 }finally{
  if(runtime)await runtime.end();await admin.query(`REVOKE ALL ON ALL TABLES IN SCHEMA ${schema} FROM ${role}`).catch(()=>{});await admin.query(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA ${schema} FROM ${role}`).catch(()=>{});await admin.query(`REVOKE ALL ON SCHEMA ${schema} FROM ${role}`).catch(()=>{});await admin.query(`DROP ROLE IF EXISTS ${role}`);await admin.end();
 }
});
