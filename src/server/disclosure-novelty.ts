import {z} from 'zod';
import type {Pool} from 'pg';
import {transaction} from './postgres';
import {TechnicalDisclosures} from './technical-disclosure-store';
import {ProfessionalStore} from './professional-store';
import {disclosureProposal} from './disclosure-proposal';
export {disclosureProposal} from './disclosure-proposal';
export async function createDisclosureNovelty(pool:Pool,id:string,input:unknown){
 const data=z.object({revision:z.number().int().positive(),datasetId:z.string().min(1)}).parse(input);
 return transaction(pool,async()=>{
  const record=await new TechnicalDisclosures(pool).read(id,data.revision);
  return new ProfessionalStore(pool).create({workflow:'novelty-search',datasetId:data.datasetId,proposal:disclosureProposal(record.snapshot.source),proposalOrigin:{type:'disclosure',id,revision:record.revision,title:record.title}});
 });
}
