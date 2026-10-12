import type {MonitorNotificationSnapshot} from '../server/monitor-notification-snapshot';
import MonitorChanges from './MonitorChanges';
export default function MonitorNotificationBody({snapshot}:{snapshot:MonitorNotificationSnapshot}){
 if(snapshot.failure)return <><p><strong>{snapshot.failure.status==='unavailable'?'监测数据不足':'监测执行失败'}</strong> · {snapshot.failure.message}</p><p className="muted">本次运行有错误或数据不足，不能据此认定无变化。</p>{snapshot.failure.warnings.map((warning,i)=><p className="muted" key={i}>{warning}</p>)}</>;
 const brief=snapshot.brief;
 return <><p>新增{brief.counts.added}，移出{brief.counts.removed}，字段更新{brief.counts.updated}</p><p className="muted">{brief.interpretation}</p><details><summary>变化记录</summary>{brief.events.map((event,i)=><div key={i}><p>{event.patent} · {event.change}{event.fields.length?' · '+event.fields.join('、'):''}{event.sourceUrl&&<> · <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer">来源</a></>}</p>{event.changes?.length?<MonitorChanges changes={event.changes}/>:event.change==='记录变化'&&<p className="muted">该历史简报未保存字段修改前后的内容。</p>}</div>)}</details></>;
}
