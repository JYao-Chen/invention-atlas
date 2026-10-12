import {z} from 'zod';
import type {Pool} from 'pg';
import type {Run} from '../lib/types';
import {connection,currentAccess,transaction} from './postgres';
import {validateReportCharts} from './professional-report';
import {compareReportSections} from '../lib/report-sections';
export class ReportVersions{
 constructor(private readonly pool:Pool){}
 async compare(reportId:string,from:number,to:number){
  const revision=z.number().int().min(0);revision.parse(from);revision.parse(to);
  const before=await this.snapshot(reportId,from),after=await this.snapshot(reportId,to);
  const basis=(run:Run)=>({sourceRunId:run.id,createdAt:run.createdAt,datasetId:run.datasetId,datasetSnapshot:run.datasetSnapshot||null,scope:run.scope||null,results:run.results.map(result=>({id:result.id,tool:result.tool,title:result.title,status:result.status,createdAt:result.createdAt,params:result.params,scope:result.scope||null,rows:result.rows.length}))});
  return {from,to,title:{before:before.title,after:after.title},sections:compareReportSections(before.run.answer,after.run.answer),basis:{before:basis(before.run),after:basis(after.run),sharedSnapshot:true,note:'草稿仅修改标题和正文；研究范围及工具结果沿用原报告快照，未重新执行分析。'}};
 }
async snapshot(reportId:string,revision=0){const db=connection(this.pool),record=(await db.query('SELECT id,title,created_at,payload FROM reports WHERE id=$1',[reportId])).rows[0];if(!record)throw new Error('报告不存在');const original={id:record.id,title:record.title,createdAt:record.created_at,run:record.payload.run as Run};if(!revision)return original;const version=(await db.query('SELECT * FROM report_versions WHERE report_id=$1 AND revision=$2',[reportId,revision])).rows[0];if(!version)throw new Error('报告版本不存在');return {...original,title:version.title+'（草稿第'+revision+'版）',revision,citationReview:version.citation_review,run:{...original.run,answer:version.answer as string}};}
 async list(reportId:string){const db=connection(this.pool),report=(await db.query('SELECT id,title,payload,created_at FROM reports WHERE id=$1',[reportId])).rows[0];if(!report)throw new Error('报告不存在');const versions=(await db.query('SELECT revision,source_revision,title,answer,status,citation_review,author_id,created_at FROM report_versions WHERE report_id=$1 ORDER BY revision',[reportId])).rows;return {original:{revision:0,title:report.title,answer:report.payload.run.answer,created_at:report.created_at,status:'saved'},versions};}
 async save(reportId:string,input:unknown){
  const data=z.object({expectedRevision:z.number().int().min(0),title:z.string().trim().min(1).max(200),answer:z.string().min(1).max(1000000)}).parse(input),scope=currentAccess();if(!scope)throw new Error('编辑报告需要项目身份');
  return transaction(this.pool,async db=>{
   const report=(await db.query('SELECT payload FROM reports WHERE id=$1 FOR UPDATE',[reportId])).rows[0];if(!report)throw new Error('报告不存在或无编辑权限');
   const latest=(await db.query('SELECT revision,answer,citation_review FROM report_versions WHERE report_id=$1 ORDER BY revision DESC LIMIT 1',[reportId])).rows[0];
   if((latest?.revision||0)!==data.expectedRevision)throw new Error('报告已有新版本，请读取最新版本后再保存');
   const run=report.payload.run as Run;validateReportCharts(data.answer,run.results);
   const review=data.answer===run.answer?'unchanged':'needs_review';
   return (await db.query('INSERT INTO report_versions(report_id,revision,source_revision,organization_id,project_id,title,answer,citation_review,author_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[reportId,data.expectedRevision+1,data.expectedRevision,scope.organizationId,scope.projectId,data.title,data.answer,review,scope.userId])).rows[0];
  });
 }
}
