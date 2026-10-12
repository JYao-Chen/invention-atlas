import {randomUUID} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
import {z} from 'zod';
import type {Pool} from 'pg';
import {connection,currentAccess} from './postgres';
const tokens=z.number().int().nonnegative().nullable();
export const usageRange=z.object({from:z.string().datetime({offset:true}).optional(),to:z.string().datetime({offset:true}).optional()}).strict().refine(value=>!value.from||!value.to||Date.parse(value.from)<Date.parse(value.to),'结束时间必须晚于开始时间');
type UsageRange=z.infer<typeof usageRange>;
const modelRun=new AsyncLocalStorage<string>();
export const currentModelRun=()=>modelRun.getStore();
export function withModelRun<T>(runId:string,work:()=>T):T{return modelRun.run(runId,work);}
export const usageInput=z.object({kind:z.enum(['chat','embedding']),model:z.string().min(1),provider:z.string().url(),status:z.enum(['completed','failed','cancelled']),inputTokens:tokens,outputTokens:tokens,totalTokens:tokens,durationMs:z.number().int().nonnegative()}).strict();
export function providerTokens(value:unknown){
 const usage=z.object({prompt_tokens:z.number().int().nonnegative().optional(),completion_tokens:z.number().int().nonnegative().optional(),total_tokens:z.number().int().nonnegative().optional()}).passthrough().safeParse(value);
 return usage.success?{inputTokens:usage.data.prompt_tokens??null,outputTokens:usage.data.completion_tokens??null,totalTokens:usage.data.total_tokens??null}:{inputTokens:null,outputTokens:null,totalTokens:null};
}
export class ModelUsage{
 constructor(private readonly pool:Pool){}
 async record(value:unknown){const data=usageInput.parse(value),scope=currentAccess();if(!scope)throw new Error('用量记录需要项目身份');return (await connection(this.pool).query('INSERT INTO model_usage(id,organization_id,project_id,actor_id,kind,model,provider,status,input_tokens,output_tokens,total_tokens,duration_ms,run_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id',[randomUUID(),scope.organizationId,scope.projectId,scope.userId,data.kind,data.model,new URL(data.provider).origin,data.status,data.inputTokens,data.outputTokens,data.totalTokens,data.durationMs,modelRun.getStore()??null])).rows[0];}
 async list(offset=0,range:UsageRange={}){const filter=usageRange.parse(range);return (await connection(this.pool).query('SELECT id,actor_id,run_id,kind,model,provider,status,input_tokens,output_tokens,total_tokens,duration_ms,created_at FROM model_usage WHERE ($2::timestamptz IS NULL OR created_at >= $2) AND ($3::timestamptz IS NULL OR created_at < $3) ORDER BY created_at DESC,id LIMIT 50 OFFSET $1',[z.number().int().nonnegative().parse(offset),filter.from??null,filter.to??null])).rows;}
 async summary(range:UsageRange={}){const filter=usageRange.parse(range);return (await connection(this.pool).query(`SELECT kind,model,provider,
 count(*) AS calls,count(*) FILTER(WHERE status='completed') AS completed,
 count(*) FILTER(WHERE status='failed') AS failed,count(*) FILTER(WHERE status='cancelled') AS cancelled,
 sum(input_tokens) AS known_input_tokens,sum(output_tokens) AS known_output_tokens,sum(total_tokens) AS known_total_tokens,
 count(*) FILTER(WHERE input_tokens IS NULL) AS unknown_input_calls,
 count(*) FILTER(WHERE output_tokens IS NULL) AS unknown_output_calls,
 count(*) FILTER(WHERE total_tokens IS NULL) AS unknown_total_calls,
 sum(duration_ms) AS duration_ms FROM model_usage
 WHERE ($1::timestamptz IS NULL OR created_at >= $1) AND ($2::timestamptz IS NULL OR created_at < $2)
 GROUP BY kind,model,provider ORDER BY kind,model,provider`,[filter.from??null,filter.to??null])).rows;}
}
export async function recordModelUsage(value:unknown){
 if(!currentAccess())return;
 const {db}=await import('./db');
 await new ModelUsage(db).record(value);
}
