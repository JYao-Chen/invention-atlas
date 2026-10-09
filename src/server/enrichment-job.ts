import {mkdirSync,existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {z} from 'zod';
import {dataRoot,analysisPatents,fullPatent,dataset,savePatent,updateDataset} from './db';
import {enrichPatent} from './public-enrichment';
import {datasetMeta} from './importers';
export const enrichmentSchema=z.object({datasetId:z.string().min(1),patentIds:z.array(z.string().regex(/^[A-Z]{2}[A-Z0-9]+$/)).min(1).max(10),refresh:z.boolean().default(false)});
export async function enrichBatch(input:z.infer<typeof enrichmentSchema>,signal:AbortSignal,progress:(data:unknown)=>void){
 const meta=dataset(input.datasetId);if(!meta)throw new Error('数据集不存在');const records=analysisPatents(meta.id);if(input.patentIds.some(id=>!records.some(p=>p.id===id)))throw new Error('补充编号必须来自当前数据集');const root=resolve(dataRoot,'sources/public-enrichment');mkdirSync(root,{recursive:true});const results=[];
 for(const id of [...new Set(input.patentIds)]){signal.throwIfAborted();try{const file=resolve(root,id+'.json');let page:{retrievedAt:string;html:string};if(existsSync(file)&&!input.refresh)page=JSON.parse(readFileSync(file,'utf8'));else{const response=await fetch(`https://patents.google.com/patent/${id}/en`,{signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])});if(!response.ok)throw new Error('来源HTTP '+response.status);page={retrievedAt:new Date().toISOString(),html:await response.text()};enrichPatent(fullPatent(meta.id,records.find(p=>p.id===id)!),page.html,page.retrievedAt);writeFileSync(file,JSON.stringify(page));}
  const original=fullPatent(meta.id,records.find(p=>p.id===id)!),p=enrichPatent(original,page.html,page.retrievedAt);if(original.publicEvidence?.commercialContext)p.publicEvidence!.commercialContext=original.publicEvidence.commercialContext;savePatent(meta.id,p);results.push({id,status:'completed',observedAt:page.retrievedAt,familyMembers:p.familyMembers.length,legalEvents:p.publicEvidence!.legalEvents.length});
 }catch(e){signal.throwIfAborted();results.push({id,status:'failed',error:(e as Error).message});}progress({done:results.length,total:new Set(input.patentIds).size,results});}
 const updated=datasetMeta(meta.name,analysisPatents(meta.id),meta.source,meta.sampling);updateDataset({...meta,coverage:updated.coverage,indexed:updated.indexed});return results;
}
