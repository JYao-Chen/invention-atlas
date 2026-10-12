import type {Patent} from '../lib/types';
import {chunkPatent} from './patent-chunks';
export async function estimateFulltext(options:{patentIds:string[];version:string;read:(id:string)=>Promise<Patent|undefined>;signal:AbortSignal}){
 let chunks=0,characters=0,tokenLower=0,tokenUpper=0,withoutText=0;
 const sections={abstract:0,claim:0,description:0};
 for(const id of [...new Set(options.patentIds)]){
  options.signal.throwIfAborted();const patent=await options.read(id);if(!patent)throw new Error('预估范围内专利不存在或无访问权限：'+id);
  const parts=chunkPatent(patent,options.version,{maxClaimChars:6000});if(!parts.length)withoutText++;
  for(const part of parts){chunks++;sections[part.section]++;characters+=part.text.length;const cjk=(part.text.match(/[\u3400-\u9fff]/g)||[]).length,other=part.text.length-cjk;tokenLower+=Math.ceil(other/5+cjk);tokenUpper+=Math.ceil(other/2+cjk*2);}
 }
 return {documents:new Set(options.patentIds).size,chunks,characters,sections,withoutText,estimatedTokens:{lower:tokenLower,upper:tokenUpper,method:'character-language-heuristic',exact:false},includesOverlap:true,reuseDeducted:false,warning:'按实际分段文本粗略估算，不是模型计费token；未扣除可复用向量，不能直接作为费用账单。'};
}
