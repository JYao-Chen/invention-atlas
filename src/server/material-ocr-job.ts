import {z} from 'zod';
import type {Pool} from 'pg';
import {connection,transaction,currentAccess} from './postgres';
import {JobStore,type Job} from './job-store';
import {ProjectMaterials} from './project-materials';
import {recognizePdfPages} from './material-ocr';
const input=z.object({materialId:z.string().min(1),pages:z.array(z.number().int().positive()).min(1).optional()}).strict();
export async function submitMaterialOcr(pool:Pool,value:unknown){
 const data=input.parse(value);
 return transaction(pool,async client=>{
  await client.query('SELECT id FROM project_materials WHERE id=$1 FOR UPDATE',[data.materialId]);
  const material=await new ProjectMaterials(pool).read(data.materialId);
  if(material.format!=='pdf')throw new Error('当前OCR仅支持PDF材料');
  const available=material.extraction.pages as {page:number;status:string}[];
  const pages=[...new Set(data.pages||available.filter(page=>page.status==='needs_ocr').map(page=>page.page))];
  if(!pages.length)throw new Error('没有待识别页；需要重识别时请明确选择PDF页码');
  if(pages.some(page=>!available.some(item=>item.page===page)))throw new Error('OCR页码超出原PDF范围');
  if((await client.query("SELECT id FROM jobs WHERE material_id=$1 AND state IN('queued','running')",[data.materialId])).rowCount)throw new Error('该材料已有OCR任务');
  return new JobStore(pool).enqueueMaterial(data.materialId,pages);
 });
}
export async function executeMaterialOcr(pool:Pool,job:Extract<Job,{kind:'material-ocr'}>,signal:AbortSignal){
 const pages=z.array(z.number().int().positive()).min(1).parse(job.payload.pages),scope=currentAccess();if(!scope)throw new Error('执行OCR需要项目身份');
 const done=new Set((await connection(pool).query('SELECT page FROM material_ocr_pages WHERE job_id=$1',[job.id])).rows.map(row=>Number(row.page)));
 const remaining=pages.filter(page=>!done.has(page));if(!remaining.length)return;
 const original=await new ProjectMaterials(pool).original(job.materialId);
 await recognizePdfPages(original.bytes,remaining,{signal,onPage:async page=>{
  signal.throwIfAborted();await connection(pool).query('INSERT INTO material_ocr_pages(job_id,page,organization_id,project_id,payload) VALUES($1,$2,$3,$4,$5) ON CONFLICT(job_id,page) DO NOTHING',[job.id,page.page,scope.organizationId,scope.projectId,JSON.stringify(page)]);
 }});
}
export async function materialOcrStatus(pool:Pool,materialId:string){
 await new ProjectMaterials(pool).read(materialId);
 return (await connection(pool).query("SELECT j.id,j.state,j.payload,j.attempts,j.cancel_requested,j.error,j.created_at,(SELECT count(*)::int FROM material_ocr_pages p WHERE p.job_id=j.id) AS done FROM jobs j WHERE j.material_id=$1 ORDER BY j.created_at DESC",[materialId])).rows;
}
export async function materialOcrResults(pool:Pool,materialId:string,jobId:string){
 await new ProjectMaterials(pool).read(materialId);
 const job=(await connection(pool).query("SELECT id,state,payload FROM jobs WHERE id=$1 AND material_id=$2 AND kind='material-ocr'",[jobId,materialId])).rows[0];
 if(!job)throw new Error('OCR任务不存在或不属于当前材料');
 const pages=(await connection(pool).query('SELECT payload FROM material_ocr_pages WHERE job_id=$1 ORDER BY page',[jobId])).rows.map(row=>row.payload);
 return {jobId:job.id,state:job.state,requestedPages:job.payload.pages,pages,done:pages.length,derived:true};
}
export async function retryMaterialOcr(pool:Pool,id:string){
 const scope=currentAccess();if(!scope)throw new Error('重试需要项目身份');
 return transaction(pool,async client=>{
  const job=(await client.query("SELECT material_id FROM jobs WHERE id=$1 AND kind='material-ocr' AND state IN('failed','cancelled')",[id])).rows[0];
  if(!job)throw new Error('OCR任务不可重试或无访问权限');
  const material=(await client.query('SELECT id FROM project_materials WHERE id=$1 AND removed_at IS NULL FOR UPDATE',[job.material_id])).rows[0];
  if(!material)throw new Error('材料已移除或无访问权限');
  if((await client.query("SELECT id FROM jobs WHERE material_id=$1 AND state IN('queued','running')",[job.material_id])).rowCount)throw new Error('该材料已有OCR任务，请先完成或取消后再重试');
  const row=(await client.query("UPDATE jobs SET state='queued',actor_id=$2,cancel_requested=false,error='',worker_id=NULL,lease_until=NULL,updated_at=now() WHERE id=$1 AND kind='material-ocr' AND state IN('failed','cancelled') RETURNING id",[id,scope.userId])).rows[0];
  if(!row)throw new Error('OCR任务不可重试或无访问权限');return row;
 });
}
