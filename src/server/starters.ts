import type {Patent,Params,Starter} from '@/lib/types';
import {suggest,questions} from '@/lib/suggestions';
import {TOOL_DEFS,capability,scope} from './tools';
import {toolDefaults,stepSchema} from './planning';
import {descriptionChars} from './db';
import {chat} from './model';
import {citationGraph,tokens} from './algorithms';

const statistical=new Set(['analyze_patent_trend','analyze_lifecycle','analyze_ipc_distribution','analyze_country_distribution','generate_wordcloud','analyze_yearly_keywords','analyze_burst_terms','analyze_entity_portfolio','analyze_concentration','analyze_competitor_evolution']);
export function starterCandidates(records:Patent[],datasetId:string,previous:string[]=[],random=Math.random):Starter[]{
 const years=(items:Patent[])=>[...new Set(items.map(p=>p.publicationDate.slice(0,4)).filter(Boolean))].sort();
 const readable=records.filter(p=>p.claims.length&&descriptionChars(p)).sort((a,b)=>descriptionChars(a)-descriptionChars(b)).slice(0,30);
 const dates=new Map(records.map(p=>[p.id,p.publicationDate]));
 const datedLink=citationGraph(records).edges.some(e=>dates.get(e.source)&&dates.get(e.target)&&dates.get(e.source)!==dates.get(e.target));
 const eligible=TOOL_DEFS.map(([name,title,group])=>({name,title,group,available:capability(name,records).available&&
  (!['search_patents','analyze_clustering'].includes(name)||records.every(p=>p.embedding?.length))&&
  (name!=='analyze_clustering'||records.length>=2)&&
  (!['read_patent_details','analyze_claim_elements','analyze_tech_matrix'].includes(name)||readable.length>0)&&
  (name!=='analyze_tech_roadmap'||datedLink)&&
  (name!=='analyze_burst_terms'||years(records).length>=2)&&
  (name!=='analyze_lifecycle'||years(records).length>=3)&&
  (name!=='analyze_co_network'||records.some(p=>p.applicants.length>1))&&
  (name!=='compare_claims'||records.filter(p=>p.claims.length&&descriptionChars(p)).length>=2)}));
 const codes=[...new Set(records.flatMap(p=>p.ipc.map(code=>code.slice(0,4))))].filter(code=>/^[A-HY]\d{2}[A-Z]$/.test(code)&&records.filter(p=>p.ipc.some(i=>i.startsWith(code))).length>=30);
 return suggest(eligible,previous,random).map(t=>{
  let params:Params={...toolDefaults(t.name,records)},prefix='';
  if(statistical.has(t.name)&&codes.length&&random()<0.7){const ipc=codes[Math.floor(random()*codes.length)],filtered=scope(records,{ipc});const ys=years(filtered);if(capability(t.name,filtered).available&&(t.name!=='analyze_burst_terms'||ys.length>=2)&&(t.name!=='analyze_lifecycle'||ys.length>=3)){params.ipc=ipc;prefix=ipc+' 分类内，';}}
  const selected=scope(records,params),ys=years(selected);
  if(statistical.has(t.name)&&ys.length>=4&&random()<0.5){const start=ys[Math.floor(random()*(ys.length-2))];params.year_start=Number(start);params.year_end=Number(ys.at(-1));prefix+=start+'—'+ys.at(-1)+' 年，';}
  if(['generate_wordcloud','analyze_yearly_keywords','analyze_entity_portfolio'].includes(t.name))params.top_k=[10,15,20][Math.floor(random()*3)];
  if(t.name==='analyze_clustering')params.k=Math.min(records.length,[3,4,5,6][Math.floor(random()*4)]);
  if(['read_patent_details','analyze_claim_elements','analyze_tech_matrix','compare_claims'].includes(t.name)&&readable.length){const p=readable[Math.floor(random()*readable.length)];params.patent_numbers=[p.id];if(t.name==='compare_claims')params.patent_numbers.push(readable.find(x=>x.id!==p.id)!.id);prefix=params.patent_numbers.join(' 与 ')+'：';}
  let question=prefix+questions[t.name];
  const source=records[Math.floor(random()*records.length)],terms=tokens(source.title).slice(0,4),query=terms.join(' ')||source.title;
  if(t.name==='search_patents'){params.query=source.title;question='检索与“'+source.title+'”相近的专利，列出相关记录和摘要依据。';}
  if(t.name==='monitor_patent_changes'){params.query=query;params.strategy_id='starter-'+terms.join('-');question='为“'+query+'”检索建立数据变化基线，已有同一基线时比较新增、移出和记录变化。';}
  if(t.name==='audit_search_strategy'){const broad=terms[0]||source.title;params.strategies=[{name:'单一术语',query:broad},{name:'组合术语',query}];question='比较“'+broad+'”与“'+query+'”两种检索表达的重合和独有记录。';}
  stepSchema.parse({tool:t.name,params});
  return {name:t.name,title:t.title,group:t.group,datasetId,params,question};
 });
}

export async function generateStarters(records:Patent[],datasetId:string,previous:string[],receive:(items:Starter[])=>void,signal?:AbortSignal,write:typeof chat=chat,prepared?:Starter[]){
 const items=prepared?structuredClone(prepared):starterCandidates(records,datasetId,previous);receive(items);if(!items.length)return {items,generated:false};
 let buffer='',generated=0;const seen=new Set<number>();
 const read=(line:string)=>{try{const row=JSON.parse(line),item=items[row.index];if(!item||seen.has(row.index)||typeof row.question!=='string')return;const question=row.question.trim();if(question.length<6||question.length>180)return;
  const validYears=new Set([String(item.params.year_start),String(item.params.year_end)]);if([...question.matchAll(/\b((?:19|20)\d{2})\b/g)].some(m=>!validYears.has(m[1])))return;
  if((question.toUpperCase().match(/\b[A-HY]\d{2}[A-Z]\b/g)||[]).some((code:string)=>code!==item.params.ipc))return;
  if((question.match(/\b[A-Z]{2}\d{5,}[A-Z]\d?\b/g)||[]).some((id:string)=>!item.params.patent_numbers?.includes(id)))return;
  if(/侵权认定|商业估值|全球实时|市场份额/.test(question.replace(/不(?:作|做|输出|进行|提供|涉及)(?:商业估值|侵权认定|全球实时|市场份额)/g,'')))return;
  items[row.index]={...item,question};seen.add(row.index);generated++;receive([...items]);
 }catch{}};
 try{await write('为专利分析平台生成4个新的中文入门问题。每个问题严格对应给定工具和已确定参数，不能新增工具、年份、分类、申请人或编号，不改研究范围。只改变研究表述，提出具体观察角度；不能承诺商业估值、侵权认定或全球实时数据。根据提供的真实标题理解该范围，不能把几个例子描述为整个范围的共同属性。状态和同族分析仅针对已有资料，不声称完整覆盖。比较权利要求不作侵权判断。问题可直接发送给助手执行。不写方法说明、不写宣传词。严格JSONL，每行{"index":0,"question":"问题"}，index对应给定项，立即换行。每行6—180字。',JSON.stringify(items.map((item,index)=>({index,tool:item.name,title:item.title,params:item.params,example:item.question,sourceTitles:scope(records,item.params).filter(p=>!item.params.patent_numbers||item.params.patent_numbers.includes(p.id)).slice(0,3).map(p=>({title:p.title,ipc:p.ipc}))}))),{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000),maxTokens:1000,onDelta:delta=>{buffer+=delta;let end;while((end=buffer.indexOf('\n'))>=0){read(buffer.slice(0,end));buffer=buffer.slice(end+1);}}});if(buffer.trim())read(buffer);}catch(e){if(signal?.aborted)throw e;}
 return {items,generated:generated>0};
}
