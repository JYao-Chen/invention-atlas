import type {Pool} from 'pg';
import type {Run} from '../lib/types';
import {ProfessionalStore} from './professional-store';
import {PostgresStore} from './postgres-store';
import {professionalInput} from './professional-workflows';
import {validateProposalArtifact} from './proposal-features';
import {validateNoveltyStrategies} from './novelty-strategies';
import {executeTool,scope} from './tools';

export async function executeNoveltyRetrieval(pool:Pool,taskId:string,run:Run,signal:AbortSignal){
 const tasks=new ProfessionalStore(pool),store=new PostgresStore(pool),task=await tasks.get(taskId);
 if(!task||task.workflow!=='novelty-search'||task.current_stage!=='retrieval'||task.status!=='running'||task.execution_run_id!==run.id)throw new Error('当前任务不在查新候选检索阶段');
 const input=professionalInput.parse(task.input);if(input.workflow!=='novelty-search')throw new Error('任务类型不匹配');
 const confirmed=(stage:string)=>task.artifacts.findLast((a:{stage:string;status:string})=>a.stage===stage&&a.status==='confirmed');
 const features=confirmed('features'),strategyArtifact=confirmed('strategies');if(!features||!strategyArtifact||strategyArtifact.data.featureRevision!==features.revision)throw new Error('缺少当前版本的确认策略');
 const source=validateProposalArtifact(input.proposal,features.data),strategies=validateNoveltyStrategies(source.features,strategyArtifact.data.strategies);
 const records=scope(await store.analysisPatents(input.datasetId),{year_start:input.yearStart,year_end:input.yearEnd,ipc:input.ipc});
 if(!records.length)throw new Error('指定分类与年份没有记录，未执行查新检索');
 const meta=await store.dataset(input.datasetId);if(!meta)throw new Error('数据集不存在');
 const memberships=new Map<string,string[]>(),hits=[];
 run.plan=strategies.map(strategy=>({tool:'search_patents',params:{query:strategy.query,top_k:100,counting:'publication'}}));await store.saveRun(run);
 for(const strategy of strategies){
  signal.throwIfAborted();let result=run.results.find(result=>result.tool==='search_patents'&&result.params.query===strategy.query&&result.status==='completed');
  if(!result){await store.event(run.id,'tool-start',{phase:'Search',tool:'search_patents',strategy:strategy.name});result=await executeTool('search_patents',{query:strategy.query,top_k:100,counting:'publication'},meta,records,{signal,semantic:true});if(result.status!=='completed')throw new Error(result.summary);signal.throwIfAborted();await store.saveResult(result);run.results.push(result);await store.saveRun(run);await store.event(run.id,'tool-result',{result});}
  const ids=result.rows.map(row=>String(row.patent));for(const id of ids)memberships.set(id,[...(memberships.get(id)||[]),strategy.name]);
  hits.push({name:strategy.name,query:strategy.query,featureIds:strategy.featureIds,resultId:result.id,returned:ids.length,method:result.method,summary:result.summary});
 }
 const artifact=await tasks.propose(taskId,'retrieval',{featureRevision:features.revision,strategyRevision:strategyArtifact.revision,patentIds:[...memberships.keys()],strategies:hits,memberships:[...memberships].map(([patent,strategies])=>({patent,strategies})),availableRecords:records.length,jurisdictions:input.jurisdictions,notes:['各策略至多保存100项候选，合并去重后交由用户确认。','布尔命中数量与语义 Top-K 分别记录。','地域目标按任务设置保存。']},run.id);
 return artifact;
}
