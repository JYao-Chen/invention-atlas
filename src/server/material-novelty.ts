import {z} from 'zod';
import type {Pool} from 'pg';
import {transaction} from './postgres';
import {ProjectMaterials} from './project-materials';
import {materialProposal} from './material-proposal';
import {ProfessionalStore} from './professional-store';
export async function createMaterialNovelty(pool:Pool,id:string,value:unknown){
 const data=z.object({datasetId:z.string().min(1),ocrJobId:z.string().min(1).optional(),pages:z.array(z.number().int().positive()).min(1).optional()}).strict().parse(value);
 return transaction(pool,async()=>{const material=await new ProjectMaterials(pool).read(id),origin={id,filename:material.filename,ocrJobId:data.ocrJobId,pages:data.pages};const proposal=await materialProposal(pool,origin);return new ProfessionalStore(pool).create({workflow:'novelty-search',datasetId:data.datasetId,proposal,materialOrigin:origin});});
}
