'use client';
import type {Params} from '@/lib/types';
export default function ToolParameters({tool,params,onChange}:{tool:string;params:Params;onChange:(params:Params)=>void}){
 const set=(key:keyof Params,value:unknown)=>{const next={...params};if(value===''||value===undefined)delete next[key];else Object.assign(next,{[key]:value});onChange(next);};
 const ranked=['search_patents','generate_wordcloud','analyze_burst_terms','analyze_yearly_keywords','analyze_ipc_distribution','analyze_country_distribution','analyze_competitor_evolution','analyze_entity_portfolio','analyze_patent_valuation','analyze_citation_network','audit_search_strategy','monitor_patent_changes'].includes(tool);
 const strategies=params.strategies||[{name:'策略一',query:''},{name:'策略二',query:''}];
 return <div className="scope-fields tool-specific-fields">
 <label>IPC 筛选<input value={params.ipc||''} placeholder="不限，例如 G06Q" onChange={e=>set('ipc',e.target.value)}/></label>
 {ranked&&<label>{tool==='analyze_yearly_keywords'?'每年关键词数量':tool==='generate_wordcloud'||tool==='analyze_burst_terms'?'关键词数量':'返回数量'}<input type="number" min={1} max={1000} value={params.top_k??(tool==='generate_wordcloud'?50:tool==='analyze_yearly_keywords'?10:20)} onChange={e=>set('top_k',e.target.value===''?undefined:Number(e.target.value))}/></label>}
 {tool==='analyze_clustering'&&<label>主题数量<input type="number" min={2} max={12} value={params.k??6} onChange={e=>set('k',e.target.value===''?undefined:Number(e.target.value))}/><span className="field-help">2—12 个主题；在高维向量中聚类，散点图用于查看投影。</span></label>}
 {tool==='analyze_patent_trend'&&<label>时间粒度<select value={params.frequency||'year'} onChange={e=>set('frequency',e.target.value)}><option value="year">按年</option><option value="month">按月</option></select></label>}
 {tool==='analyze_co_network'&&<label>合作主体<select value={params.dimension||'applicant'} onChange={e=>set('dimension',e.target.value)}><option value="applicant">申请人</option><option value="inventor">发明人</option></select></label>}
 {['analyze_claim_elements','compare_claims'].includes(tool)&&<label>权利要求编号<input value={params.claim_numbers?.join(', ')||''} placeholder="留空分析全部；例如 1, 2, 3" onChange={e=>set('claim_numbers',e.target.value.trim()?e.target.value.split(/[,，\s]+/).filter(Boolean).map(Number):undefined)}/></label>}
 {tool==='monitor_patent_changes'&&<label>监测策略名称<input value={params.strategy_id||''} maxLength={100} onChange={e=>set('strategy_id',e.target.value)} placeholder="例如 blockchain-monitor"/></label>}
 {tool==='audit_search_strategy'&&<fieldset className="strategy-fields"><legend>检索策略</legend>{strategies.map((s,i)=><div className="strategy-row" key={i}><label>策略名称<input value={s.name} onChange={e=>set('strategies',strategies.map((v,j)=>j===i?{...v,name:e.target.value}:v))}/></label><label>检索词<input value={s.query} onChange={e=>set('strategies',strategies.map((v,j)=>j===i?{...v,query:e.target.value}:v))}/></label><button disabled={strategies.length<=2} onClick={()=>set('strategies',strategies.filter((_,j)=>j!==i))}>移除</button></div>)}<button disabled={strategies.length>=10} onClick={()=>set('strategies',[...strategies,{name:'策略'+(strategies.length+1),query:''}])}>添加策略</button></fieldset>}
 </div>;
}
