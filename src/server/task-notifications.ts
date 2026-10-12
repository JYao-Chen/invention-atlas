import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Pool} from 'pg';
import {connection,currentAccess,transaction,type SqlConnection} from './postgres';
type NotificationKind='assigned'|'reassigned'|'start'|'complete'|'reopen'|'cancel';
type Task={id:string;report_id:string;revision:number;title:string;organization_id:string;project_id:string};
export async function notifyTask(db:SqlConnection,task:Task,recipient:string,kind:NotificationKind){
 const scope=currentAccess();if(!scope)throw new Error('任务通知需要项目身份');if(recipient===scope.userId)return;
 await db.query('INSERT INTO task_notifications(id,organization_id,project_id,recipient_id,actor_id,task_id,report_id,revision,kind,title) SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10 FROM project_members m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$2 AND m.project_id=$3 AND m.user_id=$4 AND u.enabled',[randomUUID(),task.organization_id,task.project_id,recipient,scope.userId,task.id,task.report_id,task.revision,kind,task.title]);
}
export class TaskNotifications{
 constructor(private readonly pool:Pool){}
 async list(input:unknown){const data=z.object({unread:z.boolean().default(false),page:z.number().int().min(1).default(1)}).parse(input);return transaction(this.pool,async db=>{
  const unread=Number((await db.query('SELECT count(*) n FROM task_notifications WHERE read_at IS NULL')).rows[0].n),total=Number((await db.query('SELECT count(*) n FROM task_notifications WHERE ($1::boolean=false OR read_at IS NULL)',[data.unread])).rows[0].n);
  const notifications=(await db.query('SELECT n.*,u.display_name AS actor_name FROM task_notifications n JOIN users u ON u.id=n.actor_id WHERE ($1::boolean=false OR n.read_at IS NULL) ORDER BY n.created_at DESC,n.id LIMIT 20 OFFSET $2',[data.unread,(data.page-1)*20])).rows;return {notifications,total,unread,page:data.page};
 },{repeatableRead:true,readOnly:true});}
 async markRead(id:string){const row=(await connection(this.pool).query('UPDATE task_notifications SET read_at=coalesce(read_at,now()) WHERE id=$1 RETURNING id,read_at',[id])).rows[0];if(!row)throw new Error('通知不存在或无读取权限');return row;}
}
