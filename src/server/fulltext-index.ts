import type {Patent} from '../lib/types';
import {ChunkStore} from './chunk-store';

export type FulltextProgress={stage:'documents'|'embeddings';done:number;total:number;model:string;version:string};
export async function indexFulltext(options:{store:ChunkStore;datasetId:string;version:string;model:string;dimensions:number;patentIds:string[];read:(id:string)=>Promise<Patent|undefined>;embed:(texts:string[],signal:AbortSignal)=>Promise<number[][]>;signal:AbortSignal;progress:(event:FulltextProgress)=>void|Promise<void>}){
 const {store,datasetId,version,model,dimensions,signal,progress}=options;
 let documents=0;await progress({stage:'documents',done:0,total:options.patentIds.length,model,version});
 for(const id of options.patentIds){
  signal.throwIfAborted();const patent=await options.read(id);if(!patent)throw new Error('全文索引范围内的专利已不存在：'+id);
  // Current embedding transport accepts at most 7000 characters; no silent claim truncation.
  await store.saveDocument(datasetId,patent,version,{maxClaimChars:6000});
  await progress({stage:'documents',done:++documents,total:options.patentIds.length,model,version});
 }
 let status=await store.progress(datasetId,version,model,dimensions,options.patentIds);
 await progress({stage:'embeddings',...status,model,version});
 let cursor:{patentId:string;ordinal:number}|undefined;
 while(true){
  signal.throwIfAborted();const batch=await store.pending(datasetId,version,model,dimensions,10,options.patentIds,cursor);if(!batch.length)break;
  const vectors=await options.embed(batch.map(chunk=>chunk.text),signal);signal.throwIfAborted();
  if(vectors.length!==batch.length)throw new Error('嵌入数量与片段数量不符');
  const inserted=await store.saveEmbeddings(datasetId,model,dimensions,batch.map((chunk,i)=>({chunk,embedding:vectors[i]})));
  const last=batch.at(-1)!;cursor={patentId:last.patentId,ordinal:last.ordinal};
  status={...status,done:status.done+inserted};await progress({stage:'embeddings',...status,model,version});
 }
 status=await store.progress(datasetId,version,model,dimensions,options.patentIds);
 return {...status,documents,version,model,dimensions};
}
