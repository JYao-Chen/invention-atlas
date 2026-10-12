import {z} from 'zod';
import type {Pool} from 'pg';
import {submitMaterialOcr,materialOcrStatus,materialOcrResults,retryMaterialOcr} from './material-ocr-job';
import {JobStore} from './job-store';
import {connection,currentAccess} from './postgres';
export async function materialOcrEndpoint(request:Request,path:string[],pool:Pool){
 const [,materialId,,jobId,action]=path,headers={'Cache-Control':'no-store'};
 if(!materialId||path.length>5)return Response.json({error:'接口不存在'},{status:404,headers});
 if(request.method==='POST'){
  const scope=currentAccess();
  if(!scope||!(await connection(pool).query('SELECT atlas_project_access($1,$2,true) AS allowed',[scope.organizationId,scope.projectId])).rows[0]?.allowed)return Response.json({error:'当前项目角色没有OCR操作权限'},{status:403,headers});
 }
 if(!jobId&&request.method==='GET')return Response.json({jobs:await materialOcrStatus(pool,materialId)},{headers});
 if(!jobId&&request.method==='POST'){
  const body=z.object({pages:z.array(z.number().int().positive()).min(1).optional()}).strict().parse(await request.json());
  return Response.json(await submitMaterialOcr(pool,{materialId,...body}),{status:202,headers});
 }
 if(jobId){
  const result=await materialOcrResults(pool,materialId,jobId);
  if(!action&&request.method==='GET')return Response.json(result,{headers});
  if(action==='retry'&&request.method==='POST')return Response.json(await retryMaterialOcr(pool,jobId),{status:202,headers});
  if(action==='cancel'&&request.method==='POST')return Response.json({cancelRequested:await new JobStore(pool).cancel(jobId)},{headers});
 }
 return Response.json({error:'不支持该操作'},{status:405,headers});
}
