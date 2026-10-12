import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Pool} from 'pg';
import type {Run} from '../lib/types';
import {connection,transaction} from './postgres';
import {monitorNotificationSnapshot} from './monitor-notification-snapshot';
export async function publishMonitorNotification(pool:Pool,subscriptionId:string,run:Run){
 const snapshot=monitorNotificationSnapshot(run);if(!snapshot)return false;
 const inserted=await connection(pool).query("INSERT INTO monitor_notifications(id,organization_id,project_id,recipient_id,subscription_id,run_id,name,snapshot) SELECT $1,s.organization_id,s.project_id,s.subscriber_id,s.id,$2,s.name,$3 FROM monitor_subscriptions s WHERE s.id=$4 AND s.subscriber_id=nullif(current_setting('app.user_id',true),'') ON CONFLICT(run_id) DO NOTHING RETURNING id",[randomUUID(),run.id,JSON.stringify(snapshot),subscriptionId]);
 return Boolean(inserted.rowCount);
}
export class MonitorNotifications{
 constructor(private readonly pool:Pool){}
 async list(input:unknown={}){
  const data=z.object({page:z.number().int().positive().default(1),unread:z.boolean().default(false),archived:z.boolean().default(false)}).strict().parse(input);
  return transaction(this.pool,async db=>{
   const counts=(await db.query('SELECT count(*)::integer AS total,count(*) FILTER(WHERE read_at IS NULL)::integer AS unread FROM monitor_notifications WHERE (archived_at IS NOT NULL)=$1',[data.archived])).rows[0];
   const total=data.unread?counts.unread:counts.total,pages=Math.max(1,Math.ceil(total/20)),page=Math.min(data.page,pages);
   const notifications=(await db.query('SELECT n.*,EXISTS(SELECT 1 FROM runs r WHERE r.id=n.run_id) AS run_available FROM monitor_notifications n WHERE ($1::boolean=false OR n.read_at IS NULL) AND (n.archived_at IS NOT NULL)=$3 ORDER BY n.created_at DESC,n.id LIMIT 20 OFFSET $2',[data.unread,(page-1)*20,data.archived])).rows;
   return {notifications,total,unread:counts.unread,page,pages,pageSize:20};
  },{repeatableRead:true,readOnly:true});
 }
 async markRead(id:string){const row=(await connection(this.pool).query('UPDATE monitor_notifications SET read_at=coalesce(read_at,now()) WHERE id=$1 RETURNING id,read_at',[id])).rows[0];if(!row)throw new Error('监测通知不存在或无阅读权限');return row;}
 async archive(id:string,archived:boolean){const row=(await connection(this.pool).query('UPDATE monitor_notifications SET archived_at=CASE WHEN $2 THEN coalesce(archived_at,now()) ELSE NULL END WHERE id=$1 RETURNING id,archived_at',[id,archived])).rows[0];if(!row)throw new Error('监测通知不存在或无阅读权限');return row;}
}
