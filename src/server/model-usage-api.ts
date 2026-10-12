import {z} from 'zod';
import type {Pool} from 'pg';
import {currentAccess} from './postgres';
import {ModelUsage,usageRange} from './model-usage';

export async function modelUsageEndpoint(request:Request,path:string[],pool:Pool){
 const headers={'Cache-Control':'no-store'};
 if(!currentAccess()?.projectId)return Response.json({error:'请选择项目'},{status:403,headers});
 if(path.length!==1)return Response.json({error:'接口不存在'},{status:404,headers});
 if(request.method!=='GET')return Response.json({error:'用量记录只支持读取'},{status:405,headers});
 const params=new URL(request.url).searchParams,raw=params.get('offset')??'0';
 const parsed=z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().nonnegative().safe()).safeParse(raw);
 if(!parsed.success)return Response.json({error:'分页位置必须是非负整数'},{status:400,headers});
 const range=usageRange.safeParse({from:params.get('from')??undefined,to:params.get('to')??undefined});
 if(!range.success)return Response.json({error:'时间范围须为带时区的ISO日期，结束时间晚于开始时间'},{status:400,headers});
 const usage=new ModelUsage(pool),offset=parsed.data;
 const [records,summary]=await Promise.all([usage.list(offset,range.data),usage.summary(range.data)]);
 const total=summary.reduce((sum,row)=>sum+BigInt(row.calls),0n);
 return Response.json({records,summary,range:range.data,offset,pageSize:50,total:total.toString(),nextOffset:BigInt(offset)+50n<total?offset+50:null,countsSource:'provider',billing:false},{headers});
}
