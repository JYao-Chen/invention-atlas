'use client';
import {useMemo,useState} from 'react';
import {partitionRows,coveragePercent,tableHeading,plottedRows} from '@/lib/result-tables';
import {chartColors,graphColors,toolGroups} from './chart-colors';
import ClusterView from './ClusterView';
import ClaimComparison from './ClaimComparison';
import WordCloud from './WordCloud';
import {BarChart,Bar,Cell,Legend,LineChart,Line,XAxis,YAxis,Tooltip,ResponsiveContainer,CartesianGrid} from 'recharts';
import {Table2,ChartColumn,Network,Download} from 'lucide-react';
import type {AnalysisResult,Graph,Row} from '@/lib/types';
const label:Record<string,string>={cumulative:'累计公开数',fitted_cumulative:'拟合累计数',metric:'指标',topic_name:'技术主题',topic_explanation:'主题解释',topic_evidence:'归纳依据专利',topic_basis:'归纳方式',topic_model:'归纳模型',patent:'公开编号',applicant:'申请人',applicants:'申请人',title:'标题',count:'数量',year:'年份',period:'公开时间',score:'筛查分',ipc:'IPC小类',cpc:'CPC',source:'来源',target:'目标',weight:'权重',word:'关键词',documents:'专利数',keywords:'主题关键词',claims:'权利要求',element:'要素',quote:'原文引文',claim:'权利要求编号',summary:'摘要',description:'说明书',field:'字段',coverage:'覆盖率',records:'记录数',indexed:'已索引',type:'类型',pagerank:'PageRank',function:'功能词',effect:'效果词',representative:'代表专利',representatives:'代表专利',status:'来源状态',as_of:'获取日期',basis:'状态依据',event_date:'事件日期',event:'事件',details:'原文详情',member:'同族代表公开件',office:'公开局',family_office:'公开局',family_definition:'同族范围',observed_at:'获取时间',ownership_date:'权属事件日期',ownership_event:'权属事件',ownership_details:'权属原文',reportedAmount:'组合披露金额',currency:'币种',transactionYear:'交易年份',assetScope:'交易范围',pricingBasis:'金额依据',associationBasis:'关联依据',limitation:'适用限制',economic_value:'单项专利估值',sourceUrl:'来源链接',retrievedAt:'获取时间',source_url:'来源链接',front:'非支配层',internal_citations:'样本内被引数',internal_pagerank:'样本内 PageRank',pareto_layer:'非支配层',family_size:'同族代表文献数',pareto_front:'非支配层',backward_citations:'后向引证数',reference_dataset_size:'分析记录数',screening_basis:'筛查依据',ownership_count:'权属事件数',claim_count:'权利要求数',publicationDate:'公开日期',assignees:'受让人',abstract:'摘要',public_evidence:'公开资料',claim_offset:'权利要求内位置'};
const metricLabels:Record<string,string>={tfidf:'TF-IDF 权重',tf:'原始词频',burst:'突现强度',documents:'包含该词的专利数',weight:'权重',score:'得分'};
function columnClass(key:string){return key==='title'?'column-title':['quote','details','ownership_details','limitation','associationBasis','pricingBasis','family_definition'].includes(key)?'column-text':'';}
function display(value:unknown){if(value===null||value===undefined)return '—';if(typeof value==='number')return Number.isInteger(value)?String(value):value.toFixed(4).replace(/0+$/,'').replace(/\.$/,'');if(Array.isArray(value))return value.map(v=>typeof v==='object'?JSON.stringify(v):v).join('; ');return typeof value==='object'?JSON.stringify(value):String(value);}
function download(name:string,data:string,type:string){const url=URL.createObjectURL(new Blob([data],{type}));const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();URL.revokeObjectURL(url);}
function HomogeneousTable({rows,keys,onPatent}:{rows:Row[];keys:string[];onPatent?:(id:string)=>void}){
 const [page,setPage]=useState(1);
 const current=Math.min(page,Math.max(1,Math.ceil(rows.length/15)));
 return <>
<div className="table-scroll">
<table>
<thead>
<tr>{keys.map(key=>
<th key={key} className={columnClass(key)}>{label[key]||key}</th>)}</tr>
</thead>
<tbody>{rows.slice((current-1)*15,current*15).map((row,i)=>
<tr key={i}>{keys.map(key=>
<td key={key} className={columnClass(key)}>{['patent','representative'].includes(key)&&row[key]?<button className="text-link" onClick={()=>onPatent?.(String(row[key]))}>{display(row[key])}</button>:<span title={display(row[key])}>{display(row[key])}</span>}</td>)}</tr>)}</tbody>
</table>
</div>{rows.length>15&&<div className="pagination">
<button disabled={current===1} onClick={()=>setPage(current-1)}>上一页</button>
<span>{(current-1)*15+1}—{Math.min(current*15,rows.length)} / {rows.length}</span>
<button disabled={current*15>=rows.length} onClick={()=>setPage(current+1)}>下一页</button>
</div>}</>
;
}
const coverageFields:Record<string,string>={title:'标题',abstract:'摘要',applicants:'申请人',publicationDate:'公开日期',ipc:'IPC分类',cpc:'CPC分类',claims:'权利要求',description:'说明书',citations:'引证',familyId:'同族标识',familyMembers:'同族成员',legalStatus:'来源法律状态',legalAsOf:'状态获取日期',filingDate:'申请日期',assignees:'受让人',inventors:'发明人'};
function DatasetSummaryTable({rows}:{rows:Row[]}){
 const overview=rows.find(row=>'records' in row),coverage=rows.filter(row=>'field' in row&&'coverage' in row);
 return <div className="dataset-summary-data">{overview&&<>
<dl className="dataset-overview">{[['records','记录数'],['applicants','申请人实体'],['indexed','已索引']].map(([key,title])=>
<div key={key}>
<dt>{title}</dt>
<dd>{display(overview[key])}</dd>
</div>)}</dl>
<div className="dataset-period">
<strong>公开年份</strong>
<span>{display(overview.period)}</span>
</div>
</>
}{coverage.length>0&&<>
<h4>字段覆盖率</h4>
<div className="table-scroll coverage-table">
<table>
<thead>
<tr>
<th>字段</th>
<th>覆盖率</th>
</tr>
</thead>
<tbody>{coverage.map((row,i)=>
<tr key={i}>
<td>{coverageFields[String(row.field)]||label[String(row.field)]||String(row.field)}</td>
<td>
<span className="coverage-value">{typeof row.coverage==='number'&&Number.isFinite(row.coverage)&&<span className="coverage-track" aria-hidden="true">
<span style={{width:Math.min(100,Math.max(0,row.coverage*100))+'%'}}/>

</span>}<span>{coveragePercent(row.coverage)}</span>
</span>
</td>
</tr>)}</tbody>
</table>
</div>
<p className="coverage-note">覆盖率表示当前分析记录中该字段非空的比例，不代表字段信息完整。</p>
</>
}</div>;
}
export function DataTable({rows,onPatent,tool}:{rows:Row[];onPatent?:(id:string)=>void;tool?:string}){
 if(!rows.length)return <p className="empty">没有符合条件的记录。可调整分析参数后重试。</p>;
 if(tool==='get_dataset_summary')return <DatasetSummaryTable rows={rows}/>
;
 if(tool==='compare_claims')return <ClaimComparison rows={rows} onPatent={onPatent}/>
;
 const groups=partitionRows(rows);
 return <div className="result-data-sections">{groups.map((group,i)=>
<div className="result-data-section" key={JSON.stringify([group.keys,group.type])}>{groups.length>1&&<h4>{tableHeading(group.keys,group.type)} <small>{group.rows.length} 条</small>
</h4>}<HomogeneousTable rows={group.rows} keys={group.keys} onPatent={onPatent}/>

</div>)}</div>;
}
function GraphView({graph,onPatent}:{graph:Graph;onPatent:(id:string)=>void}){
 const [query,setQuery]=useState(''),[selected,setSelected]=useState(''),[scale,setScale]=useState(1);
 const geometry=useMemo(()=>{const connected=new Set(graph.edges.flatMap(e=>[e.source,e.target]));const candidates=graph.nodes.filter(n=>connected.has(n.id));const roots=candidates.filter(n=>query?n.label.toLowerCase().includes(query.toLowerCase()):n.kind!=='external').sort((a,b)=>b.value-a.value).slice(0,8);const rootIds=new Set(roots.map(n=>n.id));const neighbors=new Set(graph.edges.filter(e=>rootIds.has(e.source)||rootIds.has(e.target)).flatMap(e=>[e.source,e.target]));const nodes=[...roots,...candidates.filter(n=>!rootIds.has(n.id)&&neighbors.has(n.id)).sort((a,b)=>b.value-a.value)].slice(0,60);const citation=graph.edges.some(e=>e.kind==='citation');const positions=new Map(nodes.map((n,i)=>{if(citation)return [n.id,rootIds.has(n.id)?{x:85,y:65+roots.indexOf(n)*400/Math.max(1,roots.length-1)}:{x:250+(i-roots.length)%4*96,y:35+Math.floor((i-roots.length)/4)*34}];const angle=i*2.399963229728653;const radius=35+Math.sqrt(i/Math.max(1,nodes.length))*210;return [n.id,{x:320+Math.cos(angle)*radius,y:255+Math.sin(angle)*radius}];}));return {nodes,positions,edges:graph.edges.filter(e=>positions.has(e.source)&&positions.has(e.target))};},[graph,query]);
 const selectedNode=graph.nodes.find(n=>n.id===selected);
 return <>
<div className="graph-toolbar">
<input aria-label="查找图谱节点" placeholder="查找节点…" value={query} onChange={e=>setQuery(e.target.value)}/>

<button onClick={()=>setScale(Math.min(2.5,scale+0.25))} aria-label="放大图谱">+</button>
<button onClick={()=>setScale(Math.max(.5,scale-.25))} aria-label="缩小图谱">−</button>
<button onClick={()=>setScale(1)}>复位</button>
<button onClick={e=>{const svg=e.currentTarget.closest('.result-panel')?.querySelector('.graph-svg');if(svg)download('patent-graph.svg',svg.outerHTML,'image/svg+xml');}}>
<Download size={14}/>
导出</button>
</div>
<svg className="graph-svg" viewBox={`${320-320/scale} ${255-255/scale} ${640/scale} ${510/scale}`} role="img" aria-label="专利关系图谱">
<defs>
<marker id="citation-arrow" viewBox="0 0 10 10" refX="12" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
<path d="M 0 0 L 10 5 L 0 10 z" fill="#96a7c0"/>

</marker>
</defs>
<rect x="-500" y="-500" width="2000" height="2000" fill="#f7f9fd"/>
{geometry.edges.map((edge,i)=>{const a=geometry.positions.get(edge.source)!,b=geometry.positions.get(edge.target)!;return <line markerEnd={edge.kind==='citation'?'url(#citation-arrow)':undefined} key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={selected&&(edge.source===selected||edge.target===selected)?graphColors.selected:graphColors.edge} strokeWidth={Math.min(3,1+Math.log(edge.weight))}/>
;})}{geometry.nodes.map(node=>{const pos=geometry.positions.get(node.id)!;const highlight=query&&node.label.toLowerCase().includes(query.toLowerCase());return <g key={node.id} tabIndex={0} role="button" aria-label={node.label} onClick={()=>setSelected(node.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(node.id);}}}>
<circle cx={pos.x} cy={pos.y} r={Math.min(16,5+Math.sqrt(node.value))} fill={highlight||selected===node.id?graphColors.selected:node.kind==='external'?graphColors.external:node.kind==='applicant'?graphColors.applicant:graphColors.internal}/>

<text x={pos.x+9} y={pos.y+4} fill="#172c50" fontSize="10">{node.label.length>24?node.label.slice(0,22)+'…':node.label}</text>
<title>{node.label}</title>
</g>;})}</svg>
 {!geometry.nodes.length&&<p className="empty">没有可绘制的关系边；可切换数据表查看统计。</p>}
 <div className="graph-note">全图 {graph.nodes.length} 个节点 / {graph.edges.length} 条边；预览选取最多 8 个来源节点及其真实相邻节点，共 {geometry.nodes.length} 节点、{geometry.edges.length} 边。箭头指向被引文献，蓝色为样本专利、橙色为外部节点、绿色为申请人、紫色为选中节点；查找可切换预览范围。</div>
 {selectedNode&&<div className="node-detail">
<strong>{selectedNode.label}</strong>
<span>{selectedNode.kind==='external'?'外部节点，仅有引用标识':'来源语料节点'} · 权重 {selectedNode.value}</span>{selectedNode.kind==='patent'&&<button onClick={()=>onPatent(selectedNode.id)}>查看专利原文</button>}{selectedNode.kind==='external'&&<a href={`https://patents.google.com/patent/${selectedNode.id}/en`} target="_blank" rel="noreferrer">查询公开文献</a>}</div>}</>
;
}
export default function ResultView({result,onPatent}:{result:AnalysisResult;onPatent:(id:string)=>void}){
const words=result.rows.some(row=>typeof row.word==='string');
const metrics=['tfidf','tf','burst','documents','weight','score'].filter(key=>result.rows.some(row=>typeof row[key]==='number'&&Number(row[key])>0));
const years=[...new Set(result.rows.filter(row=>typeof row.word==='string').map(row=>String(row.year||'')).filter(Boolean))].sort();
const [tab,setTab]=useState(result.clusterMap?'cluster':result.graph?'graph':words&&metrics.length?'cloud':result.chart?'chart':'data'),[metric,setMetric]=useState(metrics[0]||''),[year,setYear]=useState(years[0]||''),[displayCount,setDisplayCount]=useState(30),[chartKind,setChartKind]=useState<'bar'|'line'|'horizontal'>(result.chart?.kind||'bar');
const filtered=years.length?result.rows.filter(row=>String(row.year)===year):result.rows;
const chart=result.chart?{...result.chart,...(words&&metric?{y:metric}:{})}:words&&metrics.length?{kind:'bar' as const,x:'word',y:metric}:undefined;
const availableWords=new Set(filtered.filter(row=>typeof row.word==='string'&&Number(row[metric])>0).map(row=>row.word)).size;
const count=Math.min(displayCount,availableWords);
const chartRows=chart?words?[...filtered].sort((a,b)=>Number(b[metric])-Number(a[metric])).slice(0,count):plottedRows(filtered,chart):[];
return <section className="result-panel" data-group={toolGroups[result.tool]}>
<header>
<div>
<span className={`status-dot ${result.status}`}/>

<h3>{result.title}</h3>
</div>
<span className="result-status">{result.status==='completed'?'已完成':result.status==='unavailable'?'数据不足':'执行失败'}</span>
</header>
<p>{result.summary}</p>
<div className="result-tabs">{words&&metrics.length>0&&<button className={tab==='cloud'?'selected':''} onClick={()=>setTab('cloud')}><ChartColumn size={15}/>词云</button>}{result.clusterMap&&<button className={tab==='cluster'?'selected':''} onClick={()=>setTab('cluster')}>
<ChartColumn size={15}/>
聚类图</button>}{chart&&<button className={tab==='chart'?'selected':''} onClick={()=>setTab('chart')}>
<ChartColumn size={15}/>
{result.clusterMap?'主题数量':'图表'}</button>}{result.graph&&<button className={tab==='graph'?'selected':''} onClick={()=>setTab('graph')}>
<Network size={15}/>
图谱</button>}<button className={tab==='data'?'selected':''} onClick={()=>setTab('data')}>
<Table2 size={15}/>
数据表</button>
<button className="push-right" onClick={()=>download(result.tool+'.json',JSON.stringify(result,null,2),'application/json')}>
<Download size={15}/>
下载 JSON</button>
</div>
 {result.scope&&<p className="graph-note">输入 {result.scope.inputCount} 条 · 分析 {result.scope.analyzedCount} {result.scope.counting==='family'?'个来源同族代表件':'条公开件'} · 申请人归并规则 {result.scope.entityRules.length} 条</p>}
{['cloud','chart'].includes(tab)&&<div className="visual-options">{years.length>0&&<label>公开年份<select value={year} onChange={e=>setYear(e.target.value)}>{years.map(y=><option key={y}>{y}</option>)}</select></label>}{words&&metrics.length>0&&<label>显示指标<select value={metric} onChange={e=>setMetric(e.target.value)}>{metrics.map(key=><option value={key} key={key}>{metricLabels[key]}</option>)}</select></label>}{tab==='chart'&&chart&&<label>图表类型<select value={chartKind} onChange={e=>setChartKind(e.target.value as 'bar'|'line'|'horizontal')}><option value="bar">柱状图</option><option value="horizontal">横向条形图</option>{['year','period'].includes(chart.x)&&<option value="line">折线图</option>}</select></label>}</div>}
{words&&['cloud','chart'].includes(tab)&&availableWords>0&&<label className="word-count-control"><span>显示数量 <strong>{count}</strong><small>/ {availableWords} 个词</small></span><input aria-label="显示词数" type="range" min={1} max={availableWords} value={count} onChange={e=>setDisplayCount(Number(e.target.value))}/><span className="range-ends"><small>1</small><small>{availableWords}</small></span></label>}
{tab==='cloud'&&<WordCloud rows={filtered} metric={metric} count={count}/>}
 {tab==='cluster'&&result.clusterMap&&<ClusterView map={result.clusterMap} rows={result.rows} onPatent={onPatent}/>
} {tab==='data'&&<DataTable rows={result.rows} onPatent={onPatent} tool={result.tool}/>
}{tab==='graph'&&result.graph&&<GraphView graph={result.graph} onPatent={onPatent}/>
}{tab==='chart'&&chart&&<div className="chart">
<ResponsiveContainer width="100%" height={320}>{chartKind==='line'?<LineChart data={chartRows}>
<CartesianGrid stroke="#e0e8f3" strokeDasharray="3 3"/>

<XAxis dataKey={chart.x} fontSize={11}/>

<YAxis fontSize={11}/>

<Tooltip contentStyle={{background:'#fff',border:'1px solid #d8e1ee',borderRadius:3,fontSize:12}} cursor={{fill:'#edf3fc'}}/>

<Line name={label[chart.y]||chart.y} type="linear" dataKey={chart.y} stroke={chartColors[0]} strokeWidth={2.5} dot={{r:4,fill:chartColors[0],stroke:"#fff",strokeWidth:2}} activeDot={{r:6}}/>
{chartRows.some(row=>typeof row.fitted_cumulative==='number')&&<>
<Legend/>

<Line name="拟合累计数" type="linear" dataKey="fitted_cumulative" stroke={chartColors[1]} strokeWidth={2} strokeDasharray="5 4" dot={false}/>

</>
}</LineChart>:<BarChart data={chartRows} layout={chartKind==='horizontal'?'vertical':'horizontal'} margin={chartKind==='horizontal'?{left:10,right:20}:{bottom:40}}>
<CartesianGrid stroke="#e0e8f3" strokeDasharray="3 3" vertical={false}/>

{chartKind==='horizontal'?<XAxis type="number" fontSize={11}/>:<XAxis dataKey={chart.x} fontSize={10} angle={-25} textAnchor="end" interval={0} tickFormatter={v=>String(v).length>18?String(v).slice(0,16)+'…':String(v)}/>}

{chartKind==='horizontal'?<YAxis type="category" dataKey={chart.x} width={140} fontSize={10} interval={0} tickFormatter={v=>String(v).length>20?String(v).slice(0,18)+'…':String(v)}/>:<YAxis fontSize={11}/>}

<Tooltip contentStyle={{background:'#fff',border:'1px solid #d8e1ee',borderRadius:3,fontSize:12}} cursor={{fill:'#edf3fc'}}/>

<Bar name={metricLabels[chart.y]||label[chart.y]||chart.y} dataKey={chart.y} radius={[4,4,0,0]}>{chartRows.map((row,i)=>
<Cell key={i} fill={chart.x==="cluster"?chartColors[(Number(row.cluster)-1)%chartColors.length]:["year","period"].includes(chart.x)?chartColors[0]:chartColors[i%chartColors.length]}/>
)}</Bar>
</BarChart>}</ResponsiveContainer>{chart.kind==='bar'&&filtered.length>chartRows.length&&<p className="graph-note">图中显示当前范围前 {chartRows.length} 项，共 {filtered.length} 项；全部原始结果可切换数据表查看。</p>}</div>}
 </section>;}
