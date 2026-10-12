import type {Run} from '../lib/types';
import type {MonitorBrief} from './monitor-brief';
import type {Params} from '../lib/types';
type Base={datasetId:string;params:Params;observedAt:string;resultId?:string};
export type MonitorNotificationSnapshot=Base&(
 {brief:MonitorBrief;failure?:never}|
 {failure:{status:'failed'|'unavailable';message:string;warnings:string[]};brief?:never}
);
export function monitorNotificationSnapshot(run:Run):MonitorNotificationSnapshot|undefined{
 if(!['completed','partial','failed'].includes(run.status))return;
 const result=run.results.find(item=>item.tool==='monitor_patent_changes');
 const base={datasetId:run.datasetId,params:result?.params||run.plan.find(item=>item.tool==='monitor_patent_changes')?.params||{},observedAt:result?.createdAt||new Date().toISOString(),...(result?{resultId:result.id}:{})};
 if(run.status==='failed'||run.error||result&&result.status!=='completed')return {...base,failure:{status:result?.status==='unavailable'&&!run.error?'unavailable':'failed',message:run.error||result?.summary||'监测运行未能完成',warnings:result?.warnings||[]}};
 const brief=result?.monitorBrief;
 if(!brief||brief.baselineInitialized||!brief.counts.added&&!brief.counts.removed&&!brief.counts.updated)return;
 return {...base,brief};
}
