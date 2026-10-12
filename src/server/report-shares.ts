import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Pool} from 'pg';
import {connection,currentAccess,transaction} from './postgres';
import {ReportVersions} from './report-versions';
import {ReportPublications} from './report-publications';
export class ReportShares{
 constructor(private readonly pool:Pool){}
 async recipients(){const scope=currentAccess();if(!scope)throw new Error('请选择项目');const db=connection(this.pool);if(!(await db.query('SELECT atlas_project_access($1,$2,true) AS allowed',[scope.organizationId,scope.projectId])).rows[0].allowed)throw new Error('需要项目写权限');return (await db.query('SELECT u.id,u.username,u.display_name AS name FROM organization_members m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 AND u.enabled ORDER BY u.username',[scope.organizationId])).rows;}
 async list(reportId:string){await new ReportVersions(this.pool).snapshot(reportId);return (await connection(this.pool).query("SELECT s.id,s.revision,(s.snapshot->'publication'->>'edition')::integer AS edition,s.recipient_id,u.display_name AS recipient_name,s.created_at,s.revoked_at FROM report_shares s JOIN users u ON u.id=s.recipient_id WHERE s.report_id=$1 ORDER BY s.created_at DESC",[reportId])).rows;}
 async create(reportId:string,input:unknown){
  const data=z.object({revision:z.number().int().min(0).optional(),edition:z.number().int().positive().optional(),recipientId:z.string().min(1)}).refine(data=>(data.revision===undefined)!==(data.edition===undefined),'请选择草稿版本或发布版本，不能同时指定').parse(input),scope=currentAccess();if(!scope)throw new Error('分享报告需要项目身份');
  return transaction(this.pool,async db=>{
   const publication=data.edition===undefined?undefined:await new ReportPublications(this.pool).read(reportId,data.edition);
   const snapshot=publication||await new ReportVersions(this.pool).snapshot(reportId,data.revision!);
   const revision=publication?.publication.revision??data.revision!;
   const row=(await db.query('INSERT INTO report_shares(id,report_id,revision,organization_id,project_id,recipient_id,created_by,snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,revision,recipient_id,created_at',[randomUUID(),reportId,revision,scope.organizationId,scope.projectId,data.recipientId,scope.userId,JSON.stringify(snapshot)])).rows[0];
   await db.query("INSERT INTO activity_logs(actor_id,organization_id,action,subject_id) VALUES($1,$2,'report-share-created',$3)",[scope.userId,scope.organizationId,row.id]);return row;
  });
 }
 async revoke(reportId:string,id:string){const scope=currentAccess();if(!scope)throw new Error('撤销分享需要项目身份');return transaction(this.pool,async db=>{
  const row=(await db.query('UPDATE report_shares SET revoked_at=now() WHERE id=$1 AND report_id=$2 AND revoked_at IS NULL RETURNING id',[id,reportId])).rows[0];if(!row)throw new Error('分享不存在、已撤销或无操作权限');await db.query("INSERT INTO activity_logs(actor_id,organization_id,action,subject_id) VALUES($1,$2,'report-share-revoked',$3)",[scope.userId,scope.organizationId,id]);return row;
 });}
 async received(){return (await connection(this.pool).query("SELECT id,revision,snapshot->>'title' AS title,created_at FROM report_shares WHERE recipient_id=$1 AND revoked_at IS NULL ORDER BY created_at DESC",[currentAccess()?.userId||''])).rows;}
 async read(id:string){const row=(await connection(this.pool).query('SELECT snapshot FROM report_shares WHERE id=$1 AND recipient_id=$2 AND revoked_at IS NULL',[id,currentAccess()?.userId||''])).rows[0];if(!row)throw new Error('分享不存在或已失效');return row.snapshot as Awaited<ReturnType<ReportVersions['snapshot']>>;}
}
