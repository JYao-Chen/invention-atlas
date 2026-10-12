import {z} from 'zod';

export function partitionNoveltyEvidence(evidence:ReturnType<typeof noveltyReportEvidence>,maxChars=60000){
 if(!Number.isInteger(maxChars)||maxChars<1000)throw new Error('报告分段容量无效');
 const groups:typeof evidence.documents[]=[];let current:typeof evidence.documents=[];
 for(const document of evidence.documents){
  const batches=document.batches.length?document.batches:[undefined];
  for(let index=0;index<batches.length;index++){
   const unit={...document,batches:batches[index]===undefined?[]:[batches[index]],batchPart:index+1,batchParts:batches.length};
   if(JSON.stringify(unit).length>maxChars)throw new Error('单个对比批次超过报告分段容量，请缩小确认的方案特征或拆分任务');
   if(current.length&&JSON.stringify([...current,unit]).length>maxChars){groups.push(current);current=[];}
   current.push(unit);
  }
 }
 if(current.length)groups.push(current);
 return groups.map(documents=>({...evidence,documents}));
}

/** Keep every comparison and exact citation, without resending redundant full-text chunks. */
export function noveltyReportEvidence(input:unknown){
 const data=z.object({featureRevision:z.number().int().optional(),candidateRevision:z.number().int().optional(),documents:z.array(z.object({patentId:z.string(),chunkCount:z.number().int().nonnegative(),sourceChunks:z.array(z.unknown()),batches:z.array(z.unknown())}).passthrough())}).passthrough().parse(input);
 const documents=data.documents.map(document=>{
  const {sourceChunks,...evidence}=document;
  return {...evidence,sourceCoverage:{savedChunks:sourceChunks.length,comparedChunks:document.chunkCount,fullSourceStored:true}};
 });
 return {...data,documents,contextPolicy:'全部文献、批次、特征对比和引文均保留；原文片段保存在阶段产物，此处不重复传输。'};
}
