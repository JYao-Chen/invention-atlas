import {z} from 'zod';
import type {AnalysisResult} from '@/lib/types';
import {chat,jsonResponse} from './model';
import {readResult,resultContract} from './result-contract';
const requestSchema=z.array(z.object({resultId:z.string(),word:z.string().optional(),year:z.string().optional(),offset:z.number().int().min(0).default(0),limit:z.number().int().min(1).max(100).default(30),section:z.enum(['rows','graph','nodes']).default('rows')})).max(4);
export function retrieveResults(results:AnalysisResult[],raw:unknown){return requestSchema.parse(raw).map(request=>{const result=results.find(r=>r.id===request.resultId);if(!result)throw new Error('只能读取本次运行中的真实工具结果');return readResult(result,request);});}
export async function retrieveForReport(question:string,results:AnalysisResult[],signal:AbortSignal){
 const needs=results.some(r=>r.rows.length>120||(r.graph?.edges.length||0)>120||(r.rowSources||[]).some(s=>s.patentIds.length>20)||r.rows.some(row=>Object.values(row).some(v=>typeof v==='string'&&v.length>2000)));
 if(!needs)return {reads:[],note:'工具预览已覆盖当前结果，逐行代表证据随结果传递。'};
 try{
  const raw=await chat('为专利报告选择需要补读的已计算工具结果。只返回JSON {"reads":[{"resultId":"给定ID","section":"rows或graph","word":"可选英文关键词","year":"可选公开年","offset":0,"limit":30}]}。最多4次，每次最多100行。依据用户问题选择具体关键词、年份、图关系或排名页，不重复已经可见的默认第一页。word是精确匹配，可从问题中提取；没有需求返回空reads。补读不会重新计算，不访问外部资料。只用给定ID。',JSON.stringify({question,results:results.map(r=>({id:r.id,tool:r.tool,summary:r.summary,contract:resultContract(r),rowCount:r.rows.length,graphEdges:r.graph?.edges.length,wordExamples:r.rows.filter(row=>row.word).slice(0,15).map(row=>row.word)}))}),{json:true,maxTokens:1000,signal});
  return {reads:retrieveResults(results,jsonResponse<{reads:unknown}>(raw).reads).map(page=>'rowSources'in page?{...page,rowSources:(page.rowSources||[]).map(s=>({...s,patentCount:s.patentIds.length,patentIds:s.patentIds.slice(0,20),omittedPatentIds:Math.max(0,s.patentIds.length-20)}))}:page),note:'按用户问题补读的原始结果页；总数和nextOffset标识分页，成员编号仅预览20个但代表片段完整保留，未读取后续页不表示数据缺失。'};
 }catch(e){signal.throwIfAborted();return {reads:[],note:'结果补读未完成：'+(e as Error).message+'；仍使用带覆盖标识的工具预览，不能把省略当作缺失。'};}
}
