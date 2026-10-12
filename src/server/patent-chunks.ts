import type {Patent} from '../lib/types';

export type PatentChunk={patentId:string;documentVersion:string;section:'abstract'|'description'|'claim';claimNumber?:number;dependsOn?:number[];ordinal:number;start:number;end:number;text:string;sourceUrl:string;rawStart?:number;rawEnd?:number;chunkingVersion:'field-offset-v1'};
export type ChunkOptions={maxChars:number;overlapChars:number;maxClaimChars:number};
export const defaultChunkOptions:ChunkOptions={maxChars:4000,overlapChars:400,maxClaimChars:16000};

function ranges(text:string,max:number,overlap:number){
 const output:{start:number;end:number}[]=[];let start=0;
 while(start<text.length){
  let end=Math.min(text.length,start+max);
  if(end<text.length){
   const minimum=start+Math.floor(max*0.6);
   const paragraph=text.lastIndexOf('\n',end-1);
   const sentence=Math.max(text.lastIndexOf('. ',end-1),text.lastIndexOf('。',end-1),text.lastIndexOf('; ',end-1));
   const boundary=Math.max(paragraph,sentence);if(boundary>=minimum)end=boundary+1;
  }
  if(text.slice(start,end).trim())output.push({start,end});
  if(end===text.length)break;
  start=Math.max(start+1,end-overlap);
 }
 return output;
}

/** Offsets use JavaScript UTF-16 indices in the named source field, not bytes or tokens. */
export function chunkPatent(patent:Patent,documentVersion:string,options:Partial<ChunkOptions>={}):PatentChunk[]{
 if(!documentVersion.trim())throw new Error('全文索引必须声明原文版本');
 const cfg={...defaultChunkOptions,...options};
 if(!Number.isInteger(cfg.maxChars)||cfg.maxChars<100||!Number.isInteger(cfg.overlapChars)||cfg.overlapChars<0||cfg.overlapChars>=cfg.maxChars*0.5||!Number.isInteger(cfg.maxClaimChars)||cfg.maxClaimChars<cfg.maxChars)throw new Error('分段长度或重叠范围无效');
 const chunks:PatentChunk[]=[];
 const add=(section:PatentChunk['section'],text:string,claim?:Patent['claims'][number])=>{
  const limit=claim?cfg.maxClaimChars:cfg.maxChars;
  for(const range of ranges(text,limit,claim?0:cfg.overlapChars)){
   const location=claim?{start:claim.sourceStart,end:claim.sourceEnd}:patent.locations[section];
   const rawVerified=location?.start!==undefined&&location.end!==undefined&&patent.rawText.slice(location.start,location.end)===text;
   chunks.push({patentId:patent.id,documentVersion,section,ordinal:chunks.length,start:range.start,end:range.end,text:text.slice(range.start,range.end),sourceUrl:patent.sourceUrl,chunkingVersion:'field-offset-v1',...(claim?{claimNumber:claim.number,dependsOn:claim.dependsOn||[]}:{}),...(rawVerified?{rawStart:location!.start!+range.start,rawEnd:location!.start!+range.end}:{})});
  }
 };
 add('abstract',patent.abstract);for(const claim of patent.claims)add('claim',claim.text,claim);add('description',patent.description);
 return chunks;
}
