import type {Patent,Graph,Row} from '@/lib/types';
import {citationGraph,pagerank} from './algorithms';
import {chat,jsonResponse} from './model';
import {modelConfig} from './config';
import {db} from './db';

// SPC counts every source-to-sink path through an edge, without enumerating paths.
// References: Batagelj, Efficient Algorithms for Citation Network Analysis (2003).
export function citationMainPaths(records:Patent[]){
 const byId=new Map(records.map(p=>[p.id,p]));
 const raw=citationGraph(records).edges.filter(e=>byId.has(e.target));
 const rejected=raw.filter(e=>e.source===e.target||!byId.get(e.source)!.publicationDate||!byId.get(e.target)!.publicationDate||byId.get(e.target)!.publicationDate>=byId.get(e.source)!.publicationDate);
 const edges=[...new Map(raw.filter(e=>!rejected.includes(e)).map(e=>[e.target+'|'+e.source,{source:e.target,target:e.source,weight:1,kind:'citation'}])).values()];
 const ids=new Set(edges.flatMap(e=>[e.source,e.target]));
 const ordered=records.filter(p=>ids.has(p.id)).sort((a,b)=>a.publicationDate.localeCompare(b.publicationDate)||a.id.localeCompare(b.id));
 const incoming=new Map(ordered.map(p=>[p.id,edges.filter(e=>e.target===p.id)]));
 const outgoing=new Map(ordered.map(p=>[p.id,edges.filter(e=>e.source===p.id)]));
 const forward=new Map<string,bigint>(),backward=new Map<string,bigint>();
 for(const p of ordered)forward.set(p.id,incoming.get(p.id)!.length?incoming.get(p.id)!.reduce((s,e)=>s+forward.get(e.source)!,0n):1n);
 for(const p of [...ordered].reverse())backward.set(p.id,outgoing.get(p.id)!.length?outgoing.get(p.id)!.reduce((s,e)=>s+backward.get(e.target)!,0n):1n);
 const weights=new Map(edges.map(e=>[e.source+'|'+e.target,forward.get(e.source)!*backward.get(e.target)!]));
 const neighbors=new Map(ordered.map(p=>[p.id,new Set([...incoming.get(p.id)!.map(e=>e.source),...outgoing.get(p.id)!.map(e=>e.target)])]));
 const visited=new Set<string>(),paths:string[][]=[];
 for(const p of ordered){if(visited.has(p.id))continue;const component:string[]=[],queue=[p.id];visited.add(p.id);
  for(let i=0;i<queue.length;i++){component.push(queue[i]);for(const id of neighbors.get(queue[i])!){if(!visited.has(id)){visited.add(id);queue.push(id);}}}
  const members=new Set(component),best=new Map<string,{score:bigint;path:string[]}>();
  for(const node of ordered.filter(p=>members.has(p.id))){let selected={score:0n,path:[node.id]};for(const edge of incoming.get(node.id)!){const previous=best.get(edge.source)!;const candidate={score:previous.score+weights.get(edge.source+'|'+edge.target)!,path:[...previous.path,node.id]};if(candidate.score>selected.score)selected=candidate;}best.set(node.id,selected);}
  const sinks=component.filter(id=>!outgoing.get(id)!.length).map(id=>best.get(id)!).sort((a,b)=>a.score===b.score?a.path.join().localeCompare(b.path.join()):a.score>b.score?-1:1);
  if(sinks[0]?.path.length>1)paths.push(sinks[0].path);
 }
 const selected=new Set(paths.flatMap(path=>path.slice(1).map((id,i)=>path[i]+'|'+id)));
 const rows:Row[]=edges.map(e=>({source:e.source,target:e.target,source_date:byId.get(e.source)!.publicationDate,target_date:byId.get(e.target)!.publicationDate,search_path_count:weights.get(e.source+'|'+e.target)!.toString(),main_path:selected.has(e.source+'|'+e.target),citation_in: e.target}));
 const graph:Graph={nodes:ordered.map(p=>({id:p.id,label:p.id,kind:'patent',value:1})),edges:edges.map(e=>({...e,weight:selected.has(e.source+'|'+e.target)?3:1}))};
 return {rows,graph,paths,rejected:rejected.length,internalEdges:raw.length,connected:ids.size};
}

// No claim-count bonus or arbitrary weighted value score. All indicators describe
// the imported citation network; neither is a commercial-value estimate.
export function citationScreening(records:Patent[]):Row[]{
 const graph=citationGraph(records),ids=new Set(records.map(p=>p.id));
 const internalGraph={nodes:graph.nodes.filter(n=>ids.has(n.id)),edges:graph.edges.filter(e=>ids.has(e.target)&&e.source!==e.target)};
 const rank=pagerank(internalGraph);
 const dimensions=records.map(p=>({p,incoming:new Set(internalGraph.edges.filter(e=>e.target===p.id).map(e=>e.source)).size,rank:rank.get(p.id)||0}));
 const remaining=new Set(dimensions),fronts=new Map<string,number>();let front=1;
 while(remaining.size){const nondominated=[...remaining].filter(a=>![...remaining].some(b=>b.incoming>=a.incoming&&b.rank>=a.rank&&(b.incoming>a.incoming||b.rank>a.rank)));for(const item of nondominated){fronts.set(item.p.id,front);remaining.delete(item);}front++;}
 return dimensions.map(({p,incoming,rank})=>({patent:p.id,title:p.title,pareto_front:fronts.get(p.id),internal_citations:incoming,pagerank:rank,backward_citations:p.citations.length||null,claims:p.claims.length,reference_records:records.length,economic_value:null})).sort((a,b)=>a.pareto_front!-b.pareto_front!||a.patent.localeCompare(b.patent));
}

export type EffectRelation={technology:string;effect:string;quote:string};
export type EffectExtractor=(text:string,signal?:AbortSignal)=>Promise<EffectRelation[]>;
export function sourceChunks(p:Patent,size=16000){
 const located=(section:string,text:string,hint?:number)=>{const found=text?p.rawText.indexOf(text,hint||0):-1;return {section,text,rawStart:found>=0?found:undefined};};
 const rawSection=(name:string)=>{const location=p.locations[name];return location?p.rawText.slice(location.start,location.end).trim():'';};
 const claims=rawSection('Claims')||p.claims.map(c=>`${c.number}. ${c.text}`).join('\n\n');
 const descriptionSections=['Background/Summary','Description','Detailed Description'].filter(name=>rawSection(name)).map(name=>located(name,rawSection(name),p.locations[name].start));
 const sections=[located('abstract',p.abstract,p.locations.Abstract?.start),located('claims',claims,p.locations.Claims?.start),...(descriptionSections.length?descriptionSections:[located('description',p.description)])];
 return sections.flatMap(s=>{const chunks=[];for(let start=0;start<s.text.length;start+=size-1000)chunks.push({...s,start,text:s.text.slice(start,start+size)});return chunks;});
}
const modelExtract:EffectExtractor=async(text,signal)=>{
 const segments=[...text.matchAll(/[^\n]+(?:\n|$)/g)].flatMap(match=>{const rows=[];for(let offset=0;offset<match[0].length;offset+=400)rows.push({start:match.index!+offset,end:match.index!+Math.min(offset+400,match[0].length),text:match[0].slice(offset,offset+400)});return rows;});
 const numbered=segments.map((segment,i)=>`[${i+1}] ${segment.text}`).join('\n');
 let error='';for(let attempt=0;attempt<2;attempt++){
  try{const data=jsonResponse<{relations:{technology:string;effect:string;evidence_start:number;evidence_end:number}[]}>(await chat('从编号专利原文抽取明确陈述的技术措施→技术效果关系，只输出JSON {"relations":[{"technology":"中文技术措施","effect":"中文技术效果","evidence_start":起始片段整数编号,"evidence_end":结束片段整数编号}]}。编号区间必须同时支撑措施、效果和两者关系；只选最短的连续证据区间，不要复制原文，不要用整个文档作证据。不得仅因两个词共同出现就建立关系。背景技术、他人的问题或愿景不是本发明已实现的效果；只有明确归属于本发明/实施例的陈述才提取。无明确关系严格返回 {"relations":[]}。标签根据原文生成，禁止预设分类。'+(error?'上次输出校验失败：'+error+'。请重新核对原文和规定格式。':''),numbered,{json:true,signal}));
   if(!Array.isArray(data.relations))throw new Error('技术效果抽取未返回relations数组');
   return data.relations.map(r=>{if(typeof r.technology!=='string'||!r.technology.trim()||typeof r.effect!=='string'||!r.effect.trim()||!Number.isInteger(r.evidence_start)||!Number.isInteger(r.evidence_end)||r.evidence_start<1||r.evidence_end<r.evidence_start||r.evidence_end>segments.length)throw new Error('关系字段缺失或证据编号越界');return {technology:r.technology,effect:r.effect,quote:text.slice(segments[r.evidence_start-1].start,segments[r.evidence_end-1].end)};});
  }catch(e){signal?.throwIfAborted();error=(e as Error).message;if(attempt===1)throw e;}
 }throw new Error(error);
};
export async function extractEffects(datasetId:string,records:Patent[],signal?:AbortSignal,extract:EffectExtractor=modelExtract,onProgress?:(done:number,total:number)=>void,options:{cache?:boolean;onCheckpoint?:(done:number,total:number,reused:number)=>void}={}){
 db.exec('CREATE TABLE IF NOT EXISTS effect_checkpoints(dataset_id TEXT,patent_id TEXT,method TEXT,section TEXT,chunk_start INTEGER,payload TEXT,PRIMARY KEY(dataset_id,patent_id,method,section,chunk_start))');
 const method='full-text-evidence-v3:'+modelConfig().model,cache=options.cache??extract===modelExtract,results:Row[][]=Array.from({length:records.length},()=>[]),totalChunks=records.reduce((s,p)=>s+sourceChunks(p).length,0);let cursor=0,done=0,completedChunks=0,reused=0,stopped=false;
 const worker=async()=>{while(!stopped){const index=cursor++;if(index>=records.length)return;const p=records[index];try{
  signal?.throwIfAborted();const rows:Row[]=[],seen=new Set<string>();for(const chunk of sourceChunks(p)){
    if(stopped)return;signal?.throwIfAborted();
    const cached=cache?db.prepare('SELECT payload FROM effect_checkpoints WHERE dataset_id=? AND patent_id=? AND method=? AND section=? AND chunk_start=?').get(datasetId,p.id,method,chunk.section,chunk.start) as {payload:string}|undefined:undefined;
    const relations:EffectRelation[]=cached?JSON.parse(cached.payload):await extract(chunk.text,signal);
    for(const r of relations){if(typeof r.technology!=='string'||!r.technology.trim()||typeof r.effect!=='string'||!r.effect.trim()||typeof r.quote!=='string'||!r.quote.trim()||!chunk.text.includes(r.quote))throw new Error(`${p.id}：技术效果引文不能定位到原文`);
     const offset=chunk.start+chunk.text.indexOf(r.quote),key=chunk.section+':'+offset+':'+r.quote;if(seen.has(key))continue;seen.add(key);
     rows.push({patent:p.id,function:r.technology,effect:r.effect,quote:r.quote,section:chunk.section,section_offset:offset,source_offset:chunk.rawStart===undefined?null:chunk.rawStart+offset,source:p.sourceUrl,assessment:'专利原文声明，非独立实验验证'});
    }
    if(cache&&!cached)db.prepare('INSERT OR REPLACE INTO effect_checkpoints VALUES(?,?,?,?,?,?)').run(datasetId,p.id,method,chunk.section,chunk.start,JSON.stringify(relations));
    completedChunks++;if(cached)reused++;options.onCheckpoint?.(completedChunks,totalChunks,reused);
   }results[index]=rows;done++;onProgress?.(done,records.length);
 }catch(e){stopped=true;throw e;}}};
 const outcomes=await Promise.allSettled(Array.from({length:Math.min(4,records.length)},worker));const failure=outcomes.find(o=>o.status==='rejected');if(failure?.status==='rejected'){signal?.throwIfAborted();throw new Error(`${failure.reason.message}；本次完成 ${completedChunks}/${totalChunks} 个分段，已保存的断点可在相同参数下继续。`);}
 return results.flat();
}
