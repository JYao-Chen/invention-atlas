import {z} from 'zod';
import type {Pool} from 'pg';
import {connection,currentAccess,transaction} from './postgres';
import {ReportVersions} from './report-versions';
import {validateReportCharts} from './professional-report';

/** Publishing fixes a delivery snapshot; it does not certify legal or analytical quality. */
export class ReportPublications{
 constructor(private readonly pool:Pool){}
 async list(reportId:string){
  await new ReportVersions(this.pool).snapshot(reportId);
  return (await connection(this.pool).query('SELECT p.edition,p.revision,p.published_at,u.display_name AS publisher_name FROM report_publications p JOIN users u ON u.id=p.publisher_id WHERE p.report_id=$1 ORDER BY p.edition DESC',[reportId])).rows;
 }
 async read(reportId:string,edition:number){
  z.number().int().positive().parse(edition);
  const row=(await connection(this.pool).query('SELECT snapshot FROM report_publications WHERE report_id=$1 AND edition=$2',[reportId,edition])).rows[0];
  if(!row)throw new Error('发布版本不存在或无阅读权限');
  return row.snapshot as Awaited<ReturnType<ReportVersions['snapshot']>> & {publication:{edition:number;revision:number;publisherId:string;publishedAt:string}};
 }
 async publish(reportId:string,input:unknown){
  const data=z.object({expectedRevision:z.number().int().min(0)}).parse(input),scope=currentAccess();
  if(!scope)throw new Error('发布报告需要项目身份');
  return transaction(this.pool,async db=>{
   const report=(await db.query('SELECT id FROM reports WHERE id=$1 FOR UPDATE',[reportId])).rows[0];
   if(!report)throw new Error('报告不存在或无发布权限');
   const latest=(await db.query('SELECT max(revision) AS revision FROM report_versions WHERE report_id=$1',[reportId])).rows[0];
   if(Number(latest.revision||0)!==data.expectedRevision)throw new Error('报告已有新草稿，请读取最新版本后再发布');
   if((await db.query('SELECT edition FROM report_publications WHERE report_id=$1 AND revision=$2',[reportId,data.expectedRevision])).rowCount)throw new Error('该版本已经发布');
   const source=await new ReportVersions(this.pool).snapshot(reportId,data.expectedRevision);
   validateReportCharts(source.run.answer,source.run.results);
   const last=(await db.query('SELECT max(edition) AS edition FROM report_publications WHERE report_id=$1',[reportId])).rows[0];
   const publication={edition:Number(last.edition||0)+1,revision:data.expectedRevision,publisherId:scope.userId,publishedAt:new Date().toISOString()};
   const snapshot={...source,title:source.title.replace(/（草稿第\d+版）$/,'')+'（发布第'+publication.edition+'版）',publication};
   await db.query('INSERT INTO report_publications(report_id,edition,revision,organization_id,project_id,publisher_id,published_at,snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[reportId,publication.edition,publication.revision,scope.organizationId,scope.projectId,scope.userId,publication.publishedAt,JSON.stringify(snapshot)]);
   await db.query("INSERT INTO activity_logs(actor_id,organization_id,action,subject_id) VALUES($1,$2,'report-published',$3)",[scope.userId,scope.organizationId,reportId]);
   return publication;
  });
 }
}
