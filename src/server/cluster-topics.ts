import {z} from 'zod';
import type {Patent,Row} from '@/lib/types';
import {chat,jsonResponse} from './model';
import {modelConfig} from './config';
const schema=z.object({topics:z.array(z.object({cluster:z.number().int(),name:z.string().min(2).max(40),explanation:z.string().min(5).max(400),evidence:z.array(z.string()).min(1),mixed:z.boolean()}))});
export function applyTopicNames(rows:Row[],input:unknown):Row[]{
 const parsed=schema.safeParse(input);if(!parsed.success)throw new Error('模型主题格式不符：'+parsed.error.issues[0].path.join('.'));
 const {topics}=parsed.data;
 if(topics.length!==rows.length||new Set(topics.map(t=>t.cluster)).size!==rows.length)throw new Error('主题归纳数量或编号不匹配');
 return rows.map(row=>{const topic=topics.find(t=>t.cluster===row.cluster);if(!topic||topic.evidence.some(id=>!(row.representatives as string[]).includes(id)))throw new Error('主题归纳缺少簇内代表专利依据');return {...row,topic_name:topic.mixed?'混合主题 · '+topic.name:topic.name,topic_explanation:topic.explanation,topic_evidence:topic.evidence,topic_basis:'模型辅助归纳，需人工复核',topic_model:modelConfig().model};});
}
export async function nameClusterTopics(rows:Row[],records:Patent[],signal?:AbortSignal){
 const packet=rows.map(row=>({cluster:row.cluster,count:row.count,keywords:row.keywords,evidence_ids:row.representatives,representatives:(row.representatives as string[]).map(id=>{const p=records.find(p=>p.id===id)!;return {id,title:p.title,abstract:p.abstract};})}));
 const response=await chat('你是专利技术主题归纳助手。仅依据给定关键词与代表专利原文，为每簇生成简洁具体的中文技术名称和一句解释。不要只写主题1，不要虚构用途或将样本解释为全行业。证据不足或内容混杂时mixed=true。evidence必须为公开编号字符串数组，例如["US123B1"]，不能是对象数组、不能包含解释。只返回JSON：{"topics":[{"cluster":1,"name":"中文技术名称","explanation":"依据与共同技术内容","evidence":["给定代表专利编号"],"mixed":false}]}。覆盖每个簇，evidence只能使用该簇给定编号。',JSON.stringify(packet),{signal,json:true});
 return applyTopicNames(rows,jsonResponse(response));
}
