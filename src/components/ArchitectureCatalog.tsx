'use client';
import {useState} from 'react';
import {Search} from 'lucide-react';
import {analyticalToolRows,researchToolRows,skillRows,frameworkToolRows} from '@/lib/architecture-guide';
const categories=[{id:'analysis',title:'分析工具',count:analyticalToolRows.length},{id:'research',title:'研究工具',count:researchToolRows.length},{id:'skills',title:'Skills',count:skillRows.length}] as const;
type Category=typeof categories[number]['id'];
export default function ArchitectureCatalog(){
 const [category,setCategory]=useState<Category>('analysis'),[query,setQuery]=useState(''),[group,setGroup]=useState('');
 const rows=category==='analysis'?analyticalToolRows.filter(t=>!group||t.group===group).map(t=>({id:t.id,title:t.title,when:t.input,action:t.output})):category==='research'?researchToolRows.map(([id,when,action])=>({id,title:'',when,action})):skillRows.map(([id,title,when,method,result])=>({id,title,when,action:method+' 产出：'+result}));
 const filtered=rows.filter(row=>Object.values(row).join(' ').toLowerCase().includes(query.trim().toLowerCase()));
 return <div className="architecture-catalog">
  <div className="architecture-catalog-tabs" role="group" aria-label="能力类别">{categories.map(c=><button key={c.id} type="button" aria-pressed={category===c.id} onClick={()=>{setCategory(c.id);setGroup('');}}>{c.title}<span>{c.count}</span></button>)}</div>
  <div className="architecture-catalog-search"><label><Search size={16} aria-hidden="true"/><input aria-label="查找工具或技能" type="search" placeholder="按名称、标识或用途查找" value={query} onChange={e=>setQuery(e.target.value)}/></label>{category==='analysis'&&<select aria-label="筛选分析类别" value={group} onChange={e=>setGroup(e.target.value)}><option value="">全部分析类别</option>{[...new Set(analyticalToolRows.map(t=>t.group))].map(g=><option key={g} value={g}>{g}</option>)}</select>}</div>
  <p className="architecture-catalog-count" role="status">{query||group?'找到 '+filtered.length+' 项':'共 '+rows.length+' 项'}{category==='analysis'?'。在工作台可直接运行，深度报告通过 run_analysis 调用其中 28 项。':category==='research'?'。连接研究状态、分析结果、原文证据和章节。':'。以 SKILL.md 提供方法，Agent 按任务读取。'}</p>
  {filtered.length?<table className="architecture-catalog-table"><thead><tr><th>名称与标识</th><th>{category==='analysis'?'主要输入':'何时使用'}</th><th>作用与产出</th></tr></thead><tbody>{filtered.map(row=><tr key={row.id}><td data-label="名称与标识">{row.title&&<strong>{row.title}</strong>}<code>{row.id}</code></td><td data-label={category==='analysis'?'主要输入':'何时使用'}>{row.when}</td><td data-label="作用与产出">{row.action}</td></tr>)}</tbody></table>:<p className="architecture-catalog-empty">没有匹配项。可以换个关键词或分析类别。</p>}
  {category==='research'&&<details className="architecture-workspace-tools"><summary>工作区工具：整理文件与待办</summary><p>框架工具维护研究工作材料；正式证据与报告仍通过上方研究工具保存。</p><dl>{frameworkToolRows.map(([id,action,relation])=><div key={id}><dt><code>{id.replaceAll('`','')}</code></dt><dd>{action}。{relation}</dd></div>)}</dl></details>}
 </div>;
}
