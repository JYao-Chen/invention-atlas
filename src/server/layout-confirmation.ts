import {z} from 'zod';
import type {AnalysisResult} from '../lib/types';
import {layoutMatrix} from './layout-matrix';

const label=z.string().trim().min(1).max(500);
const mapping=z.object({source:label,label,include:z.boolean()}).strict();
export const layoutConfirmationSchema=z.object({resultId:z.string().min(1),objective:z.string().trim().min(10).max(5000),functions:z.array(mapping).min(1),effects:z.array(mapping).min(1)}).strict();

/** User-confirmed labels annotate extraction; they never replace its literal evidence. */
export function confirmLayout(source:AnalysisResult,raw:unknown){
 const confirmation=layoutConfirmationSchema.parse(raw);
 if(source.tool!=='analyze_tech_matrix'||source.status!=='completed'||!source.layoutMatrix||source.id!==confirmation.resultId)throw new Error('布局确认必须关联已完成的真实矩阵结果');
 const original=layoutMatrix(source.rows);
 function validate(labels:string[],mappings:z.infer<typeof mapping>[]){
  if(mappings.length!==labels.length||new Set(mappings.map(m=>m.source)).size!==labels.length||mappings.some(m=>!labels.includes(m.source)))throw new Error('标签确认必须完整覆盖原始标签，不得新增或重复原始标签');
  return new Map(mappings.map(m=>[m.source,m]));
 }
 const functions=validate(original.functions,confirmation.functions),effects=validate(original.effects,confirmation.effects);
 const selected=source.rows.flatMap((row,index)=>{
  const fn=functions.get(String(row.function))!,effect=effects.get(String(row.effect))!;
  return fn.include&&effect.include?[{row:{...row,function:fn.label,effect:effect.label},index}]:[];
 });
 if(!selected.length)throw new Error('确认后没有证据组合，请至少保留一项已观测关系');
 const matrix=layoutMatrix(selected.map(item=>item.row));
 for(const cell of matrix.cells)cell.evidenceRows=cell.evidenceRows.map(index=>selected[index].index);
 matrix.interpretation='按用户明确确认的标签分组及合并，计数为去重公开编号。非空组合完整保留，缺少组合只预览前120项并声明省略数量。未观察关系按本次抽取及用户保留证据统计。';
 return {resultId:source.id,objective:confirmation.objective,functions:confirmation.functions,effects:confirmation.effects,matrix,sourceEvidenceCount:source.rows.length,includedEvidenceCount:selected.length,excludedEvidenceCount:source.rows.length-selected.length,evidenceSemantics:'矩阵标签为用户确认标签，原始标签和引文保存在来源结果；evidenceRows仍指向该来源完整rows，未改写原文。',interpretation:matrix.interpretation};
}
