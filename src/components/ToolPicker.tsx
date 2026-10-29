'use client';
import type {Params} from '@/lib/types';
import ToolParameters from './ToolParameters';

export type Tool={name:string;title:string;group:string;available:boolean;defaultParams?:Params;reason:string};

// Tool tree (desktop) or grouped select (phone) plus the scope and tool-specific parameter form.
export default function ToolPicker({tools,selectedTool,params,years,samplePatent,busy,toolBusy,onSelect,onParam,onParams,onRun}:{tools:Tool[];selectedTool:string;params:Params;years:string[];samplePatent?:string;busy:boolean;toolBusy:boolean;onSelect:(name:string)=>void;onParam:(key:keyof Params,value:string)=>void;onParams:(params:Params)=>void;onRun:()=>void}){
 return <details className="tool-picker" open>
<summary>分析工具 <span>{tools.filter(t=>t.available).length}/{tools.length} 项可用</span>
</summary>
<div className="tool-layout">
<label className="tool-select">分析工具<select aria-label="分析工具" value={selectedTool} onChange={e=>onSelect(e.target.value)}>{[...new Set(tools.map(t=>t.group))].map(group=>
<optgroup key={group} label={group}>{tools.filter(t=>t.group===group).map(t=><option key={t.name} value={t.name}>{t.title}{t.available?'':'（缺少数据）'}</option>)}</optgroup>)}</select>
</label>
<div className="tool-groups">{[...new Set(tools.map(t=>t.group))].map(group=>
<details key={group} data-group={group} open={group===tools.find(t=>t.name===selectedTool)?.group}>
<summary>{group}</summary>{tools.filter(t=>t.group===group).map(t=>
<button key={t.name} className={selectedTool===t.name?'active':''} onClick={()=>onSelect(t.name)}>
<span>{t.title}</span>{!t.available&&<small>缺少数据</small>}</button>)}</details>)}</div>
<div className="tool-params" data-group={tools.find(t=>t.name===selectedTool)?.group}>
<h3>{tools.find(t=>t.name===selectedTool)?.title}</h3>{selectedTool==='analyze_tech_matrix'&&!params.patent_numbers?.length&&<p className="notice">未指定编号，将完整读取当前筛选范围的全部专利。可填入编号缩小范围，运行中可停止并续跑。</p>}<p>{tools.find(t=>t.name===selectedTool)?.reason||'默认分析当前数据集。需要限定范围时，可修改下面的参数。'}</p>
<div className="scope-fields">{['search_patents','search_patent_passages','monitor_patent_changes'].includes(selectedTool)&&<label className="query-field">检索词<input value={typeof params.query==='string'?params.query:''} onChange={e=>onParam('query',e.target.value)} placeholder="关键词、技术问题或公开编号"/>
</label>}{['read_patent_details','analyze_patent_reading','analyze_claim_elements','analyze_tech_matrix','compare_claims'].includes(selectedTool)&&<label className="query-field">公开编号<input value={Array.isArray(params.patent_numbers)?params.patent_numbers.join(', '):''} onChange={e=>onParam('patent_numbers',e.target.value)} placeholder={samplePatent||'输入专利公开编号'}/>
<span className="field-help">多个编号用逗号分隔，最多5条。默认选择原文完整、篇幅适中的一项；可自行修改编号。</span>
</label>}
<label>计数口径<select aria-label="计数口径" value={params.counting||'publication'} onChange={e=>onParam('counting',e.target.value)}><option value="publication">公开件</option><option value="family">来源同族标识去重</option></select><span className="field-help">同族口径保留最早公开件；缺标识的记录独立保留。原文与权利要求工具仍按公开件读取。</span></label>
<div className="year-fields">
<label>公开年份，从<input type="number" value={params.year_start??''} onChange={e=>onParam('year_start',e.target.value)} placeholder={years[0]}/>
</label>
<label>至<input type="number" value={params.year_end??''} onChange={e=>onParam('year_end',e.target.value)} placeholder={years.at(-1)}/>
</label>
</div>
<label>申请人<input value={typeof params.applicant==='string'?params.applicant:''} onChange={e=>onParam('applicant',e.target.value)} placeholder="不限"/>
</label>
</div>
<ToolParameters tool={selectedTool} params={params} onChange={onParams}/>
<button className="primary" disabled={busy||toolBusy||!tools.find(t=>t.name===selectedTool)?.available} onClick={onRun}>{toolBusy?'正在运行…':'运行分析'}</button>
</div>
</div>
</details>;
}
