import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Pool} from 'pg';
import {connection,currentAccess,transaction} from './postgres';
import {ReportVersions} from './report-versions';
const bodySchema=z.object({body:z.string().trim().min(1).max(10000)});
export class ReportComments{
 constructor(private readonly pool:Pool){}
 async list(reportId:string,revision:number){
  await new ReportVersions(this.pool).snapshot(reportId,z.number().int().min(0).parse(revision));
  return (await connection(this.pool).query('SELECT c.*,c.author_id=$3 AS own,u.display_name AS author_name FROM report_comments c JOIN users u ON u.id=c.author_id WHERE c.report_id=$1 AND c.revision=$2 ORDER BY c.created_at,c.id',[reportId,revision,currentAccess()?.userId||''])).rows;
 }
 async create(reportId:string,input:unknown){
  const data=bodySchema.extend({revision:z.number().int().min(0)}).parse(input),scope=currentAccess();if(!scope)throw new Error('批注需要项目身份');
  return transaction(this.pool,async db=>{
   await new ReportVersions(this.pool).snapshot(reportId,data.revision);
   return (await db.query('INSERT INTO report_comments(id,report_id,revision,organization_id,project_id,author_id,body) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[randomUUID(),reportId,data.revision,scope.organizationId,scope.projectId,scope.userId,data.body])).rows[0];
  });
 }
 async update(reportId:string,id:string,input:unknown){
  const {body}=bodySchema.parse(input);const row=(await connection(this.pool).query('UPDATE report_comments SET body=$3,updated_at=now() WHERE report_id=$1 AND id=$2 RETURNING *',[reportId,id,body])).rows[0];if(!row)throw new Error('批注不存在或无修改权限');return row;
 }
 async remove(reportId:string,id:string){
  if(!(await connection(this.pool).query('DELETE FROM report_comments WHERE report_id=$1 AND id=$2 RETURNING id',[reportId,id])).rowCount)throw new Error('批注不存在或无删除权限');
 }
}
