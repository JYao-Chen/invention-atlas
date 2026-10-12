import {z} from 'zod';
import type {Pool} from 'pg';
import type {Patent} from '../lib/types';
import {ProfessionalStore} from './professional-store';
import {PostgresStore} from './postgres-store';
import {professionalInput} from './professional-workflows';

const key=(name:string)=>name.trim().replace(/\s+/g,' ').toLocaleLowerCase();
export function entityCandidates(records:Patent[],entities:string[]){
 const names=new Map<string,number>();for(const patent of records)for(const name of new Set(patent.applicants))names.set(name,(names.get(name)||0)+1);
 return entities.map(entity=>{
  const exact=[...names].filter(([name])=>key(name)===key(entity));
  const suggestions=[...names].filter(([name])=>key(name)!==key(entity)&&(key(name).includes(key(entity))||key(entity).includes(key(name)))).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,20);
  return {entity,aliases:exact.map(([name])=>name),exact:exact.map(([name,records])=>({name,records})),suggestions:suggestions.map(([name,records])=>({name,records})),needsSelection:exact.length===0};
 });
}
export const entityMapping=z.array(z.object({entity:z.string().trim().min(1),aliases:z.array(z.string().trim().min(1))})).min(2).max(20).superRefine((groups,ctx)=>{
 const assigned=new Set<string>();for(const group of groups)for(const alias of group.aliases){const normalized=key(alias);if(assigned.has(normalized))ctx.addIssue({code:z.ZodIssueCode.custom,message:'同一申请人名称不能归入多个竞争主体'});assigned.add(normalized);}
});

export async function prepareEntityMapping(pool:Pool,taskId:string,signal:AbortSignal,executionRunId:string){
 const tasks=new ProfessionalStore(pool),task=await tasks.get(taskId);
 if(!task||task.workflow!=='competitor-analysis'||task.current_stage!=='entities'||task.status!=='running'||task.execution_run_id!==executionRunId)throw new Error('当前任务不在主体名称确认阶段');
 const input=professionalInput.parse(task.input);if(input.workflow!=='competitor-analysis')throw new Error('任务类型不匹配');
 const records=await new PostgresStore(pool).analysisPatents(input.datasetId);signal.throwIfAborted();
 return tasks.propose(taskId,'entities',{mappings:entityCandidates(records,input.entities),notes:['近似名称仅列作候选，尚未归并。确认时只将勾选的来源名称归入对应主体。','未匹配名称保留空别名，不自动选取相似主体。']},executionRunId);
}
