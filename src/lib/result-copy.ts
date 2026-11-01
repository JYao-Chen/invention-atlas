import type {AnalysisResult,Run} from './types';

// Normalize generic boilerplate only; preserve scope, evidence strength and method facts.
const replacements:Record<string,string>={
 '；标签需人工复核。':'。',
 '模型辅助归纳，需人工复核':'模型辅助归纳',
 '模型辅助，待人工复核':'模型辅助对照',
 '，剔除依据已保存，需人工复核。':'，剔除依据已保存。',
};

export function resultText(text:string){
 let inCode=false,skipDepth=0;
 return text.split('\n').map(line=>{
  if(/^\s*```/.test(line)){inCode=!inCode;return skipDepth?'':line;}
  if(inCode||/^\s*>/.test(line))return skipDepth?'':line;
  const heading=line.match(/^\s*(#{1,6})\s+(.+?)\s*#*$/);
  if(heading){
   const depth=heading[1].length;
   if(skipDepth&&depth<=skipDepth)skipDepth=0;
   if(heading[2]==='自动审计待复核问题')skipDepth=depth;
  }
  if(skipDepth)return '';
  if(/^\s*#{1,6}\s*(免责声明|通用风险提示|使用免责声明)\s*$/.test(line))return '';
  let cleaned=line;
  for(const [before,after] of Object.entries(replacements))cleaned=cleaned.replaceAll(before,after);
  // Match complete boilerplate clauses rather than discarding factual sentences.
  return cleaned.replace(/(?:本报告|本结果|以上内容|分析结果)?仅供(?:参考|探索)(?:，不构成(?:法律意见|法律建议))?[。；]?/gu,'')
   .replace(/(?:本报告|本结果)?不构成(?:法律意见|法律建议)[。；]?/gu,'');
 }).join('\n');
}
export function resultCopy(result:AnalysisResult):AnalysisResult{
 return {...result,summary:resultText(result.summary),method:resultText(result.method),warnings:result.warnings.map(resultText).filter(text=>text.trim()),...(result.layoutMatrix?{layoutMatrix:{...result.layoutMatrix,interpretation:resultText(result.layoutMatrix.interpretation)}}:{})};
}
export function runCopy(run:Run):Run{return {...run,answer:resultText(run.answer),results:run.results.map(resultCopy),...(run.scope?{scope:{...run.scope,notes:run.scope.notes.map(resultText).filter(text=>text.trim())}}:{})};}
