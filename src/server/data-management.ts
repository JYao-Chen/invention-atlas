import {z} from 'zod';
import {db,store,dataset,datasets,analysisPatents,patent,updateDataset,setting} from './db';
import {cleanId,normalize,datasetMeta} from './importers';
import {embed} from './model';
import {transaction} from './postgres';
const texts=z.array(z.string().trim().min(1));
export const recordSchema=z.object({id:z.string().min(1),title:z.string().trim().min(1),abstract:z.string().default(''),applicants:texts.default([]),assignees:texts.optional(),inventors:texts.optional(),publicationDate:z.string().refine(v=>!v||/^\d{4}-\d{2}-\d{2}$/.test(v),'公开日期格式应为 YYYY-MM-DD').default(''),ipc:texts.default([]),cpc:texts.optional(),description:z.string().optional(),claims:z.array(z.object({number:z.number().int().positive(),text:z.string().min(1)})).refine(v=>new Set(v.map(c=>c.number)).size===v.length,'权利要求编号不能重复').optional(),citations:texts.optional(),sourceUrl:z.string().url().optional(),sourceName:z.string().optional()});
export async function refreshDataset(id:string){const old=(await dataset(id));if(!old)throw new Error('数据集不存在');const current=datasetMeta(old.name,(await analysisPatents(id)),old.source,old.sampling);const next={...old,count:current.count,indexed:current.indexed,coverage:current.coverage,years:current.years,warnings:current.warnings};(await updateDataset(next));return next;}
const clearCheckpoints=store.clearCheckpoints.bind(store);
export async function writeRecord(datasetId:string,input:unknown,existingId?:string){
 return transaction(db,async client=>{
 await client.query('SELECT id FROM datasets WHERE id=$1 FOR UPDATE',[datasetId]);
 if(!(await dataset(datasetId)))throw new Error('数据集不存在');const patch=z.record(z.unknown()).parse(input),previous=existingId?(await patent(datasetId,existingId)):undefined;
 if(existingId&&!previous)throw new Error('记录不存在');const fields=recordSchema.parse({...previous,...patch}),id=cleanId(fields.id);if(!id)throw new Error('公开编号不能为空');if(existingId&&id!==existingId)throw new Error('编辑时不能更改公开编号；请新增记录');if(!existingId&&Boolean((await patent(datasetId,id))))throw new Error('公开编号已存在，请使用编辑');
 const next={...previous,...normalize({...previous,...fields},'用户新增'),editedAt:new Date().toISOString(),editedFields:[] as string[]};
 if(previous){next.claims=next.claims.map(c=>previous.claims.find(v=>v.number===c.number&&v.text===c.text)||c);if(previous.title===next.title&&previous.abstract===next.abstract)next.embedding=previous.embedding;else delete next.embedding;}
 const changed=Object.keys(patch).filter(k=>k in fields&&JSON.stringify((next as unknown as Record<string,unknown>)[k])!==JSON.stringify((previous as unknown as Record<string,unknown>|undefined)?.[k]));
 if(previous&&!changed.length)return {patent:previous,dataset:(await dataset(datasetId))!};
 next.editedFields=[...new Set([...(previous as (typeof previous)&{editedFields?:string[]})?.editedFields||[],...changed])];
 const textChanged=previous&&(previous.description!==next.description||JSON.stringify(previous.claims.map(c=>[c.number,c.text]))!==JSON.stringify(next.claims.map(c=>[c.number,c.text])));
 await client.query('INSERT INTO patents(dataset_id,id,payload) VALUES($1,$2,$3) ON CONFLICT(dataset_id,id) DO UPDATE SET payload=excluded.payload',[datasetId,id,JSON.stringify(next)]);if(textChanged)await clearCheckpoints(datasetId,id);return {patent:next,dataset:await refreshDataset(datasetId)};
 });}
export async function deleteRecords(datasetId:string,ids:string[]){if(!await dataset(datasetId))throw new Error('数据集不存在');if(!ids.length)throw new Error('请选择要删除的记录');return transaction(db,async client=>{const unique=[...new Set(ids)];const removed=await client.query('DELETE FROM patents WHERE dataset_id=$1 AND id=ANY($2::text[])',[datasetId,unique]);for(const id of unique)await clearCheckpoints(datasetId,id);return {deleted:removed.rowCount||0,dataset:await refreshDataset(datasetId)};});}
export async function deleteDataset(id:string){if(!await dataset(id))throw new Error('数据集不存在');return transaction(db,async client=>{await client.query('DELETE FROM patents WHERE dataset_id=$1',[id]);await client.query('DELETE FROM datasets WHERE id=$1',[id]);await client.query('DELETE FROM settings WHERE key=ANY($1::text[])',[['entities:'+id,'starter-pool:'+id]]);await clearCheckpoints(id);if(await setting('active_dataset')===id){const next=(await datasets())[0];if(next)await setting('active_dataset',next.id);else await client.query("DELETE FROM settings WHERE key='active_dataset'");}return {active:(await dataset())?.id||null};});}
const indexing=new Set<string>();
const readers=new Map<string,number>();
export const isIndexing=(id:string)=>indexing.has(id);
export const isDataBusy=(id:string)=>indexing.has(id)||Boolean(readers.get(id));
export async function beginDataRead(id:string){if(!(await dataset(id)))throw new Error('数据集不存在');readers.set(id,(readers.get(id)||0)+1);}
export function endDataRead(id:string){const remaining=(readers.get(id)||1)-1;if(remaining)readers.set(id,remaining);else readers.delete(id);}
export function claimIndex(id:string){if(indexing.has(id))throw new Error('该数据集已有数据任务在运行');indexing.add(id);}
export function releaseDataJob(id:string){indexing.delete(id);}
export async function indexDataset(id:string,signal:AbortSignal,progress:(p:{done:number;total:number})=>void,request:typeof embed=embed){try{const records=(await analysisPatents(id)),pending=records.filter(p=>!p.embedding?.length);let done=records.length-pending.length;(await refreshDataset(id));progress({done,total:records.length});for(let i=0;i<pending.length;i+=10){signal.throwIfAborted();const batch=pending.slice(i,i+10),vectors=await request(batch.map(p=>p.title+'\n'+p.abstract),signal);await store.saveEmbeddings(id,batch.map((p,j)=>({id:p.id,embedding:vectors[j]})));done+=batch.length;(await refreshDataset(id));progress({done,total:records.length});}return (await refreshDataset(id));}finally{indexing.delete(id);}}
