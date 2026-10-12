import type {Pool} from 'pg';
import {currentAccess,withAccess} from './postgres';
import {MonitorSubscriptions} from './monitor-subscriptions';

export async function dispatchDueMonitors(maintenance:Pool,business:Pool,model:string){
 if(currentAccess())throw new Error('到期订阅扫描只能由后台维护进程执行');
 const due=(await maintenance.query("SELECT s.id,s.subscriber_id,s.organization_id,s.project_id FROM monitor_subscriptions s JOIN datasets d ON d.id=s.dataset_id JOIN users u ON u.id=s.subscriber_id JOIN project_members p ON p.user_id=s.subscriber_id AND p.project_id=s.project_id AND p.organization_id=s.organization_id JOIN organization_members o ON o.user_id=s.subscriber_id AND o.organization_id=s.organization_id WHERE s.enabled AND (s.next_run_at<=now() OR d.source_revision>s.submitted_source_revision) AND u.enabled AND p.role IN('owner','analyst') AND NOT EXISTS(SELECT 1 FROM runs r WHERE r.id=s.last_run_id AND r.payload->>'status'='running') ORDER BY s.next_run_at,s.id LIMIT 100")).rows;
 const submitted:string[]=[],errors:{id:string;message:string}[]=[];
 for(const item of due){
  try{const run=await withAccess({userId:item.subscriber_id,organizationId:item.organization_id,projectId:item.project_id},()=>new MonitorSubscriptions(business).submitDue(item.id,model));if(run)submitted.push(run.id);}
  catch(error){errors.push({id:item.id,message:(error as Error).message});}
 }
 return {submitted,errors};
}
