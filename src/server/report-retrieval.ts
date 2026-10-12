import {z} from 'zod';
import type {AnalysisResult} from '@/lib/types';
import {chat,jsonResponse} from './model';
import {readResult,resultContract} from './result-contract';
const requestSchema=z.array(z.object({resultId:z.string(),word:z.string().optional(),year:z.string().optional(),function:z.string().optional(),effect:z.string().optional(),offset:z.number().int().min(0).default(0),limit:z.number().int().min(1).max(100).default(30),section:z.enum(['rows','graph','nodes','layout']).default('rows')})).max(4);
export function retrievalContext(results:AnalysisResult[]){return results.map(r=>({id:r.id,tool:r.tool,summary:r.summary,contract:resultContract(r),rowCount:r.rows.length,graphEdges:r.graph?.edges.length,layout:r.layoutMatrix?{cellCount:r.layoutMatrix.cells.length,previewCellCount:Math.min(120,r.layoutMatrix.cells.length),omittedCells:Math.max(0,r.layoutMatrix.cells.length-120),functions:r.layoutMatrix.functions,effects:r.layoutMatrix.effects,evidenceFilters:'section=rows支持function和effect精确标签匹配；offset是筛选后证据页偏移，rowSources.row仍为原始行号。',interpretation:r.layoutMatrix.interpretation}:undefined,wordExamples:r.rows.filter(row=>row.word).slice(0,15).map(row=>row.word)}));}
export function retrieveResults(results:AnalysisResult[],raw:unknown){return requestSchema.parse(raw).map(request=>{const result=results.find(r=>r.id===request.resultId);if(!result)throw new Error('只能读取本次运行中的真实工具结果');return readResult(result,request);});}
export async function retrieveForReport(question:string,results:AnalysisResult[],signal:AbortSignal){
 const needs=results.some(r=>r.rows.length>120||(r.layoutMatrix?.cells.length||0)>120||(r.graph?.edges.length||0)>120||(r.rowSources||[]).some(s=>s.patentIds.length>20)||r.rows.some(row=>Object.values(row).some(v=>typeof v==='string'&&v.length>2000)));
 if(!needs)return {reads:[],note:'工具预览已覆盖当前结果，逐行代表证据随结果传递。'};
 try{
  const raw=await chat('为专利报告选择需要补读的已计算工具结果。只返回JSON {"reads":[{"resultId":"给定ID","section":"rows、graph、nodes或layout","word":"可选英文关键词","year":"可选公开年","function":"可选原始技术措施标签","effect":"可选原始效果标签","offset":0,"limit":30}]}。最多4次，每次最多100行。依据用户问题选择具体关键词、年份、图关系或排名页，不重复已经可见的默认第一页。布局矩阵预览最多120个单元格，后续单元格用section=layout及offset=120读取；evidenceRows是原始rows的索引，原文证据用section=rows及对应offset补读，也可用function和effect精确匹配同一组合的全部证据并分页。word、year、function、effect仅过滤rows，不能用于过滤矩阵。word是精确匹配，可从问题中提取；没有需求返回空reads。补读不会重新计算，不访问外部资料。只用给定ID。',JSON.stringify({question,results:retrievalContext(results)}),{json:true,signal});
  return {reads:retrieveResults(results,jsonResponse<{reads:unknown}>(raw).reads).map(page=>'rowSources'in page?{...page,rowSources:(page.rowSources||[]).map(s=>({...s,patentCount:s.patentIds.length,patentIds:s.patentIds.slice(0,20),omittedPatentIds:Math.max(0,s.patentIds.length-20)}))}:page),note:'按用户问题补读的原始结果页；总数和nextOffset标识分页，成员编号仅预览20个但代表片段完整保留，未读取后续页不表示数据缺失。'};
 }catch(e){signal.throwIfAborted();return {reads:[],note:'结果补读未完成：'+(e as Error).message+'；仍使用带覆盖标识的工具预览，不能把省略当作缺失。'};}
}
