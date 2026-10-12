import type {Pool} from 'pg';
import {z} from 'zod';
import {ModelBudget} from './model-budget';
import {connection,currentAccess} from './postgres';
export async function modelBudgetEndpoint(request:Request,path:string[],pool:Pool){
 const headers={'Cache-Control':'no-store'},runId=path[1];
 if(path.length!==3||!runId)return Response.json({error:'接口不存在'},{status:404,headers});
 const budget=new ModelBudget(pool);
 if(request.method==='GET')return Response.json({budget:await budget.read(runId),unit:'requests',failedRequestsConsumeBudget:true},{headers});
 if(request.method==='PATCH'){
  const scope=currentAccess();if(!scope||!(await connection(pool).query('SELECT atlas_project_access($1,$2,true) AS allowed',[scope.organizationId,scope.projectId])).rows[0]?.allowed)return Response.json({error:'当前角色不能修改任务预算'},{status:403,headers});
  const body=z.object({maxCalls:z.number().int().positive().max(2147483647)}).strict().safeParse(await request.json());
  if(!body.success)return Response.json({error:'最大调用次数须为正整数'},{status:400,headers});
  await budget.set(runId,body.data.maxCalls);
  return Response.json({budget:await budget.read(runId),unit:'requests',failedRequestsConsumeBudget:true},{headers});
 }
 return Response.json({error:'不支持该操作'},{status:405,headers});
}
