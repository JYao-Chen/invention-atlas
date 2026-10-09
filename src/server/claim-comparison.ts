import {z} from 'zod';
import type {Patent,Row} from '@/lib/types';
import {extractClaimElements} from './claim-analysis';
import {chat,jsonResponse} from './model';
import {db} from './db';
import {modelConfig} from './config';
const matchesSchema=z.object({matches:z.array(z.object({source:z.string().regex(/^S\d+$/),target:z.string().regex(/^T\d+$/).nullable(),relation:z.enum(['supported','partial','not_found']),reason:z.string().min(1)}))});
export async function compareClaims(datasetId:string,records:Patent[],claimNumbers:number[]|undefined,signal?:AbortSignal,progress?:(done:number,total:number,label:string)=>void,request:typeof chat=chat,extract=extractClaimElements){
 if(records.length<2)throw new Error('权利要求对照至少需要两个公开编号；第一个是对照基准');
 if(request===chat)db.exec('CREATE TABLE IF NOT EXISTS comparison_checkpoints(key TEXT PRIMARY KEY,payload TEXT NOT NULL)');
 const elements=await extract(datasetId,records,claimNumbers,signal,progress,request),source=elements.filter(r=>r.patent===records[0].id),targets=records.slice(1),rows:Row[]=[];
 const total=Math.ceil(source.length/4)*targets.length;let done=0;
 for(const patent of targets){const target=elements.filter(r=>r.patent===patent.id);for(let start=0;start<source.length;start+=4){signal?.throwIfAborted();const batch=source.slice(start,start+4);let matches:z.infer<typeof matchesSchema>['matches']=[],repair='';
  const key=JSON.stringify(['claim-comparison-v2',datasetId,modelConfig().model,modelConfig().base,batch,target]);const cached=request===chat?db.prepare('SELECT payload FROM comparison_checkpoints WHERE key=?').get(key) as {payload:string}|undefined:undefined;
  if(cached)matches=matchesSchema.parse(JSON.parse(cached.payload)).matches;else for(let attempt=0;attempt<2;attempt++){try{const parsed=matchesSchema.parse(jsonResponse(await request('比较两份专利权利要求的技术要素。只输出JSON {"matches":[{"source":"S0","target":"T0","relation":"partial","reason":"中文说明"}]}。source只能使用给定S编号，target只能使用给定T编号或JSON null。每个给定S编号恰好一项，每个要素只选最多一个对应T编号，禁止遍历全部目标输出全部配对。reason最多80字，不返回原文引文。不仅根据宽泛词语相似判定所有特征相同。supported必须有候选引文全部约束的明确证据；partial有部分对应证据；not_found未找到对应且target必须为null。如果根本没有对应引文应使用not_found，不是partial。不作新颖性、侵权或有效性判断。'+repair,JSON.stringify({source:batch.map((r,i)=>({id:'S'+i,element:r.element,quote:r.quote})),target:target.map((r,i)=>({id:'T'+i,element:r.element,quote:r.quote}))}),{json:true,signal,maxTokens:1800})));matches=parsed.matches;
   if(matches.length!==batch.length||new Set(matches.map(m=>m.source)).size!==batch.length||matches.some(m=>Number(m.source.slice(1))>=batch.length||(m.relation==='not_found'?m.target!==null:m.target===null||Number(m.target.slice(1))>=target.length)))throw new Error('对照缺行或证据索引越界：必须覆盖 '+batch.map((_,i)=>'S'+i).join(',')+'，target范围T0至T'+(target.length-1)+'；not_found用null，其他关系必须有T编号');break;
  }catch(e){signal?.throwIfAborted();if(attempt===1)throw e;repair='上次输出校验失败，请修正：'+(e as Error).message;}}
  if(!cached&&request===chat)db.prepare('INSERT OR REPLACE INTO comparison_checkpoints VALUES(?,?)').run(key,JSON.stringify({matches}));
  for(const m of matches){const a=batch[Number(m.source.slice(1))],b=m.target===null?undefined:target[Number(m.target.slice(1))];rows.push({patent:a.patent,claim:a.claim,element:a.element,quote:a.quote,claim_offset:a.claim_offset,target_patent:patent.id,target_claim:b?.claim??null,target_element:b?.element??null,target_quote:b?.quote??null,target_offset:b?.claim_offset??null,relation:m.relation,reason:m.reason,source:records[0].sourceUrl,target_source:patent.sourceUrl,date_relation:patent.publicationDate&&records[0].publicationDate?(patent.publicationDate<records[0].publicationDate?'候选公开较早（非优先权结论）':'候选公开非较早'):'公开日期缺失，不判断先后',review:'模型辅助，待人工复核'});}
  progress?.(++done,total,cached?'权利要求逐项对照（复用断点）':'权利要求逐项对照');
 }}return rows;
}
