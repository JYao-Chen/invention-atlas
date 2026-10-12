import type {Pool} from 'pg';
import {ProfessionalStore} from './professional-store';
import {professionalInput} from './professional-workflows';
import {extractProposalFeatures} from './proposal-features';
import {chat} from './model';
import {generateNoveltyStrategies} from './novelty-strategies';
import {validateProposalArtifact} from './proposal-features';

export async function prepareProposalFeatures(pool:Pool,taskId:string,signal:AbortSignal,executionRunId:string,write:typeof chat=chat){
 const tasks=new ProfessionalStore(pool),task=await tasks.get(taskId);
 if(!task||task.workflow!=='novelty-search'||task.current_stage!=='features'||task.status!=='running'||task.execution_run_id!==executionRunId)throw new Error('当前任务不在技术方案要素提取阶段');
 const input=professionalInput.parse(task.input);if(input.workflow!=='novelty-search')throw new Error('任务类型不匹配');
 const data=await extractProposalFeatures(input.proposal,signal,write);signal.throwIfAborted();
 return tasks.propose(taskId,'features',data,executionRunId);
}

export async function prepareNoveltyStrategies(pool:Pool,taskId:string,signal:AbortSignal,executionRunId:string,write:typeof chat=chat){
 const tasks=new ProfessionalStore(pool),task=await tasks.get(taskId);
 if(!task||task.workflow!=='novelty-search'||task.current_stage!=='strategies'||task.status!=='running'||task.execution_run_id!==executionRunId)throw new Error('当前任务不在查新策略准备阶段');
 const input=professionalInput.parse(task.input);if(input.workflow!=='novelty-search')throw new Error('任务类型不匹配');
 const artifact=task.artifacts.findLast((a:{stage:string;status:string})=>a.stage==='features'&&a.status==='confirmed');if(!artifact)throw new Error('缺少已确认的方案特征');
 const source=validateProposalArtifact(input.proposal,artifact.data),strategies=await generateNoveltyStrategies(source.features,signal,write);
 signal.throwIfAborted();return tasks.propose(taskId,'strategies',{featureRevision:artifact.revision,strategies,conditions:{year_start:input.yearStart,year_end:input.yearEnd,ipc:input.ipc},jurisdictions:input.jurisdictions,notes:['这些策略尚未执行，需要确认术语与范围。','地域条件只表示研究目标；来源不提供完整地域覆盖时不能宣称已完成全球查新。']},executionRunId);
}
