import {z} from 'zod';
import {store} from './db';
const idsSchema=z.array(z.string().trim().min(1)).min(1);
export async function deleteSaved(kind:'reports'|'conversations',input:unknown,isActive:(id:string)=>boolean=()=>false){return store.deleteSaved(kind,idsSchema.parse(input),isActive);}
