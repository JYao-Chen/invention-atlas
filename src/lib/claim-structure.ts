import type {Claim} from './types';
type Reference={numbers:number[];quote:string;start:number;end:number};
export function splitClaimText(claim:Claim): (Claim & {sourceClaimNumber:number;sourceClaimOffset:number})[]{
 const markers=[...claim.text.matchAll(/^[ \t]*(?:\*\*(\d+)\*\*|(\d+))[.、]\s+/gm)];
 if(markers.length<2||claim.text.slice(0,markers[0].index).trim()||Number(markers[0][1]||markers[0][2])!==claim.number||markers.some((marker,index)=>index>0&&Number(marker[1]||marker[2])<=Number(markers[index-1][1]||markers[index-1][2])))return [{...claim,sourceClaimNumber:claim.number,sourceClaimOffset:0}];
 return markers.map((marker,index)=>{const start=marker.index!,end=markers[index+1]?.index??claim.text.length;return {number:Number(marker[1]||marker[2]),text:claim.text.slice(start,end),sourceClaimNumber:claim.number,sourceClaimOffset:start,...(claim.sourceStart===undefined?{}:{sourceStart:claim.sourceStart+start,sourceEnd:claim.sourceStart+end})};});
}
export function claimStructure(sourceClaims:Claim[]){
 const claims=sourceClaims.flatMap(splitClaimText);
 const numbers=new Set(claims.map(claim=>claim.number)),duplicates=new Set(claims.filter((claim,index)=>claims.findIndex(other=>other.number===claim.number)!==index).map(claim=>claim.number));
 const nodes=claims.map(claim=>{
  const references:Reference[]=[],issues:string[]=[];
  const expression=/\bclaims?\s+(\d+(?:\s*(?:[-–—]|to|through|,\s*(?:(?:and|or)\s*)?|and|or)\s*\d+)*)|权利要求\s*(\d+(?:\s*(?:至|到|[-–—]|、|，|,|和|或|及)\s*\d+)*)/gi;
  for(const match of claim.text.matchAll(expression)){
   const prefix=claim.text.slice(0,match.index).trim(),suffix=claim.text.slice(match.index!+match[0].length);
   if(Number(match[1])===claim.number&&(!prefix||/^(?:\*\*\d+\*\*|\d+)[.、]$/.test(prefix))&&/^\s+(?:is|outlines|represents)\b/i.test(suffix))continue;
   const list=match[1]||match[2],found:number[]=[];
   for(const part of list.split(/\s*(?:,\s*(?:(?:and|or)\s*)?|、|，|\band\b|\bor\b|和|或|及)\s*/i)){
    const range=/^(\d+)\s*(?:[-–—]|to|through|至|到)\s*(\d+)$/i.exec(part);
    if(range){const from=Number(range[1]),to=Number(range[2]);if(to<from||to-from>1000){issues.push('引用范围无法解析：'+part);continue;}for(let number=from;number<=to;number++)found.push(number);}else if(/^\d+$/.test(part.trim()))found.push(Number(part));else issues.push('引用编号无法解析：'+part);
   }
   references.push({numbers:[...new Set(found)],quote:match[0],start:match.index!,end:match.index!+match[0].length});
  }
  const parents=[...new Set(references.flatMap(reference=>reference.numbers).concat(claim.dependsOn||[]))];
  if(duplicates.has(claim.number))issues.push('权利要求编号重复');
  for(const parent of parents){if(!numbers.has(parent))issues.push('引用的权利要求'+parent+'未包含在当前原文');if(parent>=claim.number)issues.push('引用编号'+parent+'不是在先权利要求');if(duplicates.has(parent))issues.push('引用编号'+parent+'对应多项原文');}
  if(!references.length&&!parents.length&&/\b(?:of|to|in|under)\s+(?:(?:the|any|a|one)\s+)*claims?\b|权利要求|preceding\s+claims?/i.test(claim.text.replace(/^\s*\d+[.、]\s*/,'')))issues.push('存在权利要求引用措辞，但未解析出明确编号');
  const cancelled=/^\s*(?:(?:\*\*\d+\*\*|\d+)[.、]\s*)?\(?\s*(?:cancelled|canceled|取消|已删除)\s*\)?[.。]?\s*$/i.test(claim.text);
  const status=cancelled?'cancelled':!claim.text.trim()||issues.length?'unresolved':parents.length?'dependent':'independent';
  return {number:claim.number,status,dependsOn:parents,references,issues,text:claim.text,sourceStart:claim.sourceStart,sourceEnd:claim.sourceEnd,sourceClaimNumber:claim.sourceClaimNumber,sourceClaimOffset:claim.sourceClaimOffset};
 });
 return {nodes,edges:nodes.flatMap(node=>node.dependsOn.filter(number=>numbers.has(number)&&number<node.number&&!duplicates.has(number)).map(number=>({from:node.number,to:number}))),notes:['关系依据保存权利要求的明确引用编号及来源提供的dependsOn；不使用说明书推断。','未发现引用编号的非空项标为独立项；这是结构识别，不是保护范围或法律有效性判定。','缺失、重复、前向引用及未解析措辞保留为待确认，不自动补造父项。']};
}
