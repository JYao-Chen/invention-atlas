import {z} from 'zod';
import type {AnalysisResult} from '../lib/types';
import {chat,jsonResponse} from './model';
import {confirmLayout} from './layout-confirmation';

const directionSchema=z.object({title:z.string().trim().min(1).max(300),function:z.string().trim().min(1).max(500),effect:z.string().trim().min(1).max(500),hypothesis:z.string().trim().min(10).max(3000),evidenceRows:z.array(z.number().int().nonnegative()).min(1).max(20),query:z.string().trim().min(3).max(2000),reason:z.string().trim().min(10).max(3000)}).strict();
export const layoutDirectionsSchema=z.object({directions:z.array(directionSchema).max(5),unresolved:z.array(z.string().trim().min(1).max(1000)).max(20)}).strict();

export function validateLayoutDirections(source:AnalysisResult,confirmation:unknown,raw:unknown){
 const confirmed=confirmLayout(source,confirmation),parsed=layoutDirectionsSchema.parse(raw),included=new Set(confirmed.matrix.cells.flatMap(cell=>cell.evidenceRows));
 const seen=new Set<string>();
 const directions=parsed.directions.map(direction=>{
  if(!confirmed.matrix.functions.includes(direction.function)||!confirmed.matrix.effects.includes(direction.effect))throw new Error('候选方向标签必须来自已确认矩阵');
  if(new Set(direction.evidenceRows).size!==direction.evidenceRows.length||direction.evidenceRows.some(index=>!included.has(index)))throw new Error('方向证据必须来自保留的原始证据行，不得重复或引用已排除证据');
  const cells=confirmed.matrix.cells.filter(cell=>cell.evidenceRows.some(index=>direction.evidenceRows.includes(index)));
  if(!cells.some(cell=>cell.function===direction.function)||!cells.some(cell=>cell.effect===direction.effect))throw new Error('方向证据须分别支持选定技术措施与效果标签');
  const key=JSON.stringify([direction.function,direction.effect,direction.query]);if(seen.has(key))throw new Error('候选方向与补检索式不能重复');seen.add(key);
  const observed=confirmed.matrix.cells.find(cell=>cell.function===direction.function&&cell.effect===direction.effect);
  return {...direction,relationStatus:observed?'observed_in_selected_evidence':'unobserved_recombination_hypothesis',observedPublications:observed?.documents||0,evidence:direction.evidenceRows.map(index=>({...source.rows[index],row:index,patent:String(source.rows[index].patent),quote:String(source.rows[index].quote)})),limitation:observed?'该关系来自专利文本声明。':'此组合为重组假设，引用分别对应措施与效果。'};
 });
 return {resultId:source.id,objective:confirmed.objective,directions,unresolved:parsed.unresolved,proposedBy:'model-assisted',legalAssessmentPerformed:false};
}

export async function suggestLayoutDirections(source:AnalysisResult,confirmation:unknown,signal:AbortSignal,request:typeof chat=chat){
 const confirmed=confirmLayout(source,confirmation);
 const raw=await request('依据研发目标与用户确认矩阵提出最多5个可补检索的技术方向。返回JSON {"directions":[{"title":"方向名称","function":"确认的措施标签","effect":"确认的效果标签","hypothesis":"待验证技术假设","evidenceRows":[原始证据行号],"query":"针对技术内容的英文检索式，不检索专利布局/挖掘方法本身","reason":"为何与研发目标有关"}],"unresolved":["未解决问题"]}。每个方向须引用提供的保留证据，分别支持措施和效果；不得编造标签或行号。已观测关系不意味着满足研发目标，未观测重组只是假设，不是专利空白、新颖性或自由实施结论。没有依据时返回空directions并说明缺口。不得把未预览证据说成不存在。',JSON.stringify({objective:confirmed.objective,matrix:confirmed.matrix,evidencePreview:confirmed.matrix.cells.map(cell=>({function:cell.function,effect:cell.effect,totalEvidenceRows:cell.evidenceRows.length,omittedEvidenceRows:Math.max(0,cell.evidenceRows.length-3),rows:cell.evidenceRows.slice(0,3).map(index=>({row:index,...source.rows[index]}))}))}),{json:true,signal});
 signal.throwIfAborted();return validateLayoutDirections(source,confirmation,jsonResponse(raw));
}
