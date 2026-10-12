import type {Params} from '../lib/types';
export default function MonitorStrategyFields({params={}}:{params?:Params}){
 return <>
  <label>检索表达<input name="query" required maxLength={2000} defaultValue={String(params.query||'')}/></label>
  <label>策略名称<input name="strategy_id" required maxLength={100} defaultValue={String(params.strategy_id||'')}/></label>
  <label>返回数量<input name="top_k" type="number" min={1} max={1000} defaultValue={Number(params.top_k??20)} required/></label>
  <label>计数口径<select name="counting" aria-label="监测计数口径" defaultValue={String(params.counting||'publication')}><option value="publication">公开件</option><option value="family">同族代表件</option></select></label>
  <label>起始公开年<input name="year_start" type="number" defaultValue={String(params.year_start??'')}/></label>
  <label>结束公开年<input name="year_end" type="number" defaultValue={String(params.year_end??'')}/></label>
  <label>申请人<input name="applicant" maxLength={300} defaultValue={String(params.applicant||'')}/></label>
  <label>IPC前缀<input name="ipc" maxLength={100} defaultValue={String(params.ipc||'')}/></label>
 </>;
}
