import type {MonitorFieldChange} from '../server/monitor-brief';

function valueText(value:unknown){
 if(value===null||value===undefined)return '空值或未保存';
 return typeof value==='string'?value:JSON.stringify(value,null,2);
}
export default function MonitorChanges({changes}:{changes:MonitorFieldChange[]}){
 return <>{changes.map(change=><details className="monitor-field-change" key={change.field}>
  <summary>{change.field} · 修改内容</summary>
  <dl><div><dt>修改前</dt><dd>{valueText(change.before)}</dd></div><div><dt>修改后</dt><dd>{valueText(change.after)}</dd></div></dl>
 </details>)}</>;
}
