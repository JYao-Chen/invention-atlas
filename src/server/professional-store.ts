import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {z} from 'zod';
import {connection,currentAccess,transaction} from './postgres';
import {professionalInput,PROFESSIONAL_WORKFLOWS} from './professional-workflows';
import {PostgresStore} from './postgres-store';
import {TechnicalDisclosures} from './technical-disclosure-store';
import {disclosureProposal} from './disclosure-proposal';
import {materialProposal} from './material-proposal';
import {entityMapping} from './professional-entities';
import {validateProposalArtifact} from './proposal-features';
import {validateNoveltyStrategies} from './novelty-strategies';
import {validateComparisonRows} from './novelty-comparison';
import {chunkPatent} from './patent-chunks';
import {isDeepStrictEqual} from 'node:util';
import {sourceChunks} from './substantive-analysis';
import {confirmLayout} from './layout-confirmation';
import {validateLayoutDirections} from './layout-directions';

export class ProfessionalStore{
 constructor(private readonly pool:Pool){}
 async create(input:unknown){
  const parsed=professionalInput.parse(input),scope=currentAccess();if(!scope)throw new Error('专业任务需要项目身份');
  const workflow=PROFESSIONAL_WORKFLOWS.find(w=>w.id===parsed.workflow)!;
  return transaction(this.pool,async client=>{
   if(parsed.workflow==='novelty-search'&&parsed.materialOrigin&&parsed.proposal!==await materialProposal(this.pool,parsed.materialOrigin))throw new Error('查新方案与声明的原始材料文本不一致');
   if(parsed.workflow==='novelty-search'&&parsed.proposalOrigin){
    const origin=parsed.proposalOrigin,source=await new TechnicalDisclosures(this.pool).read(origin.id,origin.revision);
    if(origin.title!==source.title||parsed.proposal!==disclosureProposal(source.snapshot.source))throw new Error('查新方案与声明的交底材料版本不一致');
   }
   if(!await new PostgresStore(this.pool).dataset(parsed.datasetId))throw new Error('数据集不存在');
   return (await client.query("INSERT INTO professional_tasks(id,organization_id,project_id,actor_id,workflow,workflow_version,input,current_stage,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'ready') RETURNING *",[randomUUID(),scope.organizationId,scope.projectId,scope.userId,workflow.id,workflow.version,parsed,workflow.stages[0].id])).rows[0];
  });
 }
 async get(id:string){
  const task=(await connection(this.pool).query('SELECT * FROM professional_tasks WHERE id=$1',[id])).rows[0];
  if(!task)return undefined;
  const artifacts=(await connection(this.pool).query('SELECT * FROM professional_artifacts WHERE task_id=$1 ORDER BY stage,revision',[id])).rows;
  const execution=task.execution_run_id?await new PostgresStore(this.pool).run(task.execution_run_id):undefined;
  return {...task,artifacts,executionError:execution?.error||''};
 }
 async list(){return (await connection(this.pool).query('SELECT * FROM professional_tasks ORDER BY updated_at DESC')).rows;}
 async propose(id:string,stage:string,input:unknown,executionRunId?:string){
  const data=z.record(z.unknown()).refine(d=>Object.keys(d).length>0,'阶段产物不能为空').parse(input);
  const scope=currentAccess();if(!scope)throw new Error('保存产物需要项目身份');
  return transaction(this.pool,async client=>{
   const task=(await client.query('SELECT * FROM professional_tasks WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!task)throw new Error('专业任务不存在');
   if(task.status==='queued'||task.status==='running'&&task.execution_run_id!==executionRunId)throw new Error('阶段正在执行，请先停止任务再修改产物');
   const workflow=PROFESSIONAL_WORKFLOWS.find(w=>w.id===task.workflow&&w.version===task.workflow_version);if(!workflow)throw new Error('流程版本不可用');
   const index=workflow.stages.findIndex(s=>s.id===stage),current=workflow.stages.findIndex(s=>s.id===task.current_stage);
   if(index<0||index>current)throw new Error('必须先完成前置阶段');
   if(task.status==='cancelled'||task.status==='failed')throw new Error('任务已终止');
   if(stage==='labels'&&task.workflow==='patent-layout'){
    const expected=professionalInput.parse(task.input);if(expected.workflow!=='patent-layout')throw new Error('布局输入类型不一致');
    const extraction=(await client.query("SELECT revision,data FROM professional_artifacts WHERE task_id=$1 AND stage='extraction' AND status='confirmed' ORDER BY revision DESC LIMIT 1",[id])).rows[0];
    if(!extraction||data.extractionRevision!==extraction.revision)throw new Error('布局抽取版本已改变');
    const source=await new PostgresStore(this.pool).savedResult(extraction.data.resultId);
    if(!source||source.datasetId!==expected.datasetId)throw new Error('布局原始结果不存在');
    const confirmed=confirmLayout(source,data.confirmation);
    if(confirmed.objective!==expected.objective)throw new Error('标签阶段不能改变任务研发目标，请创建新任务');
    data.confirmed=confirmed;
   }
   const revision=Number((await client.query('SELECT coalesce(max(revision),0)+1 AS revision FROM professional_artifacts WHERE task_id=$1 AND stage=$2',[id,stage])).rows[0].revision);
   await client.query("UPDATE professional_artifacts SET status='stale' WHERE task_id=$1 AND stage=ANY($2::text[])",[id,workflow.stages.slice(index).map(s=>s.id)]);
   const artifact=(await client.query("INSERT INTO professional_artifacts(task_id,stage,revision,data,status,author_id) VALUES($1,$2,$3,$4,'proposed',$5) RETURNING *",[id,stage,revision,data,scope.userId])).rows[0];
   await client.query("UPDATE professional_tasks SET current_stage=$2,status='awaiting_confirmation',updated_at=now() WHERE id=$1",[id,stage]);
   return artifact;
  });
 }
 async confirm(id:string,stage:string,revision:number){
  z.number().int().positive().parse(revision);const scope=currentAccess();if(!scope)throw new Error('确认产物需要项目身份');
  return transaction(this.pool,async client=>{
   const task=(await client.query('SELECT * FROM professional_tasks WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!task)throw new Error('专业任务不存在');
   if(task.current_stage!==stage||task.status!=='awaiting_confirmation')throw new Error('当前阶段没有待确认产物');
   const artifact=(await client.query('SELECT * FROM professional_artifacts WHERE task_id=$1 AND stage=$2 ORDER BY revision DESC LIMIT 1',[id,stage])).rows[0];
   if(!artifact||artifact.revision!==revision||artifact.status!=='proposed')throw new Error('产物版本已改变，请查看最新版本');
   if(stage==='directions'&&task.workflow==='patent-layout'){
    const labels=(await client.query("SELECT revision,data FROM professional_artifacts WHERE task_id=$1 AND stage='labels' AND status='confirmed' ORDER BY revision DESC LIMIT 1",[id])).rows[0];
    const research=(await client.query("SELECT revision,data FROM professional_artifacts WHERE task_id=$1 AND stage='scope' AND status='confirmed' ORDER BY revision DESC LIMIT 1",[id])).rows[0];
    if(!labels||!research||artifact.data.labelRevision!==labels.revision||artifact.data.scopeRevision!==research.revision||!isDeepStrictEqual(artifact.data.searchPatentIds,research.data.patentIds))throw new Error('布局标签或研究范围版本已改变');
    const expected=professionalInput.parse(task.input),store=new PostgresStore(this.pool),source=await store.savedResult(labels.data.confirmation.resultId);
    if(!source||source.datasetId!==expected.datasetId)throw new Error('布局原始结果不存在');
    const raw=z.object({directions:z.array(z.record(z.unknown())),unresolved:z.array(z.string())}).parse(artifact.data.suggestions);
    const computed=validateLayoutDirections(source,labels.data.confirmation,{directions:raw.directions.map(d=>({title:d.title,function:d.function,effect:d.effect,hypothesis:d.hypothesis,evidenceRows:d.evidenceRows,query:d.query,reason:d.reason})),unresolved:raw.unresolved});
    if(!isDeepStrictEqual(computed,artifact.data.suggestions))throw new Error('候选方向与原始证据不一致');
    const searches=z.array(z.object({tool:z.enum(['search_patents','search_patent_passages']),query:z.string(),resultId:z.string(),status:z.string(),returned:z.number().int().nonnegative()})).parse(artifact.data.searches);
    if(searches.length!==new Set(computed.directions.map(d=>d.query)).size*2||new Set(searches.map(s=>JSON.stringify([s.query,s.tool]))).size!==searches.length)throw new Error('布局补检索尚未完整执行');
    for(const direction of computed.directions)for(const tool of ['search_patents','search_patent_passages']){
     const search=searches.find(s=>s.query===direction.query&&s.tool===tool),result=search?await store.savedResult(search.resultId):undefined;
     if(!search||!result||result.datasetId!==expected.datasetId||result.tool!==tool||result.params.query!==direction.query||result.status!==search.status||result.rows.length!==search.returned)throw new Error('布局补检索记录与真实结果不一致');
     if(result.scope?.patentIds.some(p=>!research.data.patentIds.includes(p)))throw new Error('布局补检索超出确认范围');
    }
   }
   if(stage==='labels'&&task.workflow==='patent-layout'){
    const expected=professionalInput.parse(task.input);if(expected.workflow!=='patent-layout')throw new Error('布局输入类型不一致');
    const extraction=(await client.query("SELECT revision,data FROM professional_artifacts WHERE task_id=$1 AND stage='extraction' AND status='confirmed' ORDER BY revision DESC LIMIT 1",[id])).rows[0];
    if(!extraction||artifact.data.extractionRevision!==extraction.revision)throw new Error('布局抽取版本已改变');
    const source=await new PostgresStore(this.pool).savedResult(extraction.data.resultId);
    if(!source||source.datasetId!==expected.datasetId)throw new Error('布局原始结果不存在');
    const computed=confirmLayout(source,artifact.data.confirmation);
    if(computed.objective!==expected.objective||!isDeepStrictEqual(computed,artifact.data.confirmed))throw new Error('确认矩阵与保存依据不一致，请重新准备标签');
   }
   if(stage==='extraction'&&task.workflow==='patent-layout'){
    const expected=professionalInput.parse(task.input),store=new PostgresStore(this.pool);
    const candidate=(await client.query("SELECT revision,data FROM professional_artifacts WHERE task_id=$1 AND stage='retrieval' AND status='confirmed' ORDER BY revision DESC LIMIT 1",[id])).rows[0];
    if(!candidate||artifact.data.candidateRevision!==candidate.revision||!isDeepStrictEqual(artifact.data.patentIds,candidate.data.patentIds))throw new Error('布局候选版本已改变');
    const result=await store.savedResult(z.string().parse(artifact.data.resultId));
    if(!result||result.tool!=='analyze_tech_matrix'||result.status!=='completed'||result.datasetId!==expected.datasetId||!result.layoutMatrix)throw new Error('布局原始抽取结果不存在');
    const ids=z.array(z.string()).min(1).parse(candidate.data.patentIds),actual=result.scope?.patentIds||[];
    if(actual.length!==ids.length||new Set(actual).size!==ids.length||actual.some(p=>!ids.includes(p)))throw new Error('布局抽取没有覆盖全部确认候选');
    for(const patentId of ids){const patent=await store.patent(expected.datasetId,patentId);if(!patent)throw new Error('布局候选原文已删除');const chunks=sourceChunks(patent);
     for(const row of result.rows.filter(r=>r.patent===patentId)){if(typeof row.quote!=='string'||typeof row.section_offset!=='number'||!chunks.some(c=>c.section===row.section&&row.section_offset as number>=c.start&&c.text.slice(Number(row.section_offset)-c.start,Number(row.section_offset)-c.start+String(row.quote).length)===row.quote))throw new Error('布局引文与当前原文不一致，请重新抽取');}
    }
    if(result.rows.some(row=>!ids.includes(String(row.patent))))throw new Error('布局证据包含候选之外的文献');
   }
   if(stage==='retrieval'&&task.workflow==='patent-layout'){
    const research=(await client.query("SELECT revision,data FROM professional_artifacts WHERE task_id=$1 AND stage='scope' AND status='confirmed' ORDER BY revision DESC LIMIT 1",[id])).rows[0];
    if(!research||artifact.data.scopeRevision!==research.revision)throw new Error('布局研究范围版本已改变，请重新检索');
    const ids=z.array(z.string()).parse(artifact.data.patentIds);
    if(!ids.length)throw new Error('布局候选为空，请调整范围或检索词后重试');
    const expected=professionalInput.parse(task.input),store=new PostgresStore(this.pool);
    const records=new Set((await store.analysisPatents(expected.datasetId)).map(p=>p.id));
    if(new Set(ids).size!==ids.length||ids.some(p=>!research.data.patentIds.includes(p)||!records.has(p)))throw new Error('布局候选必须来自当前确认范围且不能重复');
    if(expected.query){
     const result=await store.savedResult(z.string().parse(artifact.data.searchResult?.id));
     if(!result||result.tool!=='search_patents'||result.status!=='completed'||result.datasetId!==expected.datasetId||result.params.query!==expected.query)throw new Error('布局候选检索结果不存在或已改变');
     const hits=new Set(result.rows.map(row=>String(row.patent)));
     if(ids.some(p=>!hits.has(p)))throw new Error('布局候选必须来自实际检索结果');
    }
   }
   if(stage==='features'){
    const expected=professionalInput.parse(task.input);if(expected.workflow!=='novelty-search')throw new Error('特征阶段与任务类型不一致');
    validateProposalArtifact(expected.proposal,artifact.data);
   }
   if(stage==='strategies'){
    const expected=professionalInput.parse(task.input);if(expected.workflow!=='novelty-search')throw new Error('策略阶段与任务类型不一致');
    const features=(await client.query("SELECT revision,data FROM professional_artifacts WHERE task_id=$1 AND stage='features' AND status='confirmed' ORDER BY revision DESC LIMIT 1",[id])).rows[0];
    if(!features||artifact.data.featureRevision!==features.revision)throw new Error('方案特征版本已改变，请重新准备检索策略');
    const source=validateProposalArtifact(expected.proposal,features.data);validateNoveltyStrategies(source.features,artifact.data.strategies);
   }
   if(stage==='retrieval'&&task.workflow==='novelty-search'){
    const prior=(await client.query("SELECT stage,revision FROM professional_artifacts WHERE task_id=$1 AND stage IN ('features','strategies') AND status='confirmed'",[id])).rows;
    if(!prior.some(a=>a.stage==='features'&&a.revision===artifact.data.featureRevision)||!prior.some(a=>a.stage==='strategies'&&a.revision===artifact.data.strategyRevision))throw new Error('检索依据版本已改变，请重新执行候选检索');
    const ids=z.array(z.string()).parse(artifact.data.patentIds);
    if(!ids.length)throw new Error('候选为空，无法继续原文对比；请修改策略重新检索');
    const expected=professionalInput.parse(task.input);
    const store=new PostgresStore(this.pool);
    const records=new Set((await store.analysisPatents(expected.datasetId)).filter(p=>(!expected.yearStart||Number(p.publicationDate.slice(0,4))>=expected.yearStart)&&(!expected.yearEnd||Number(p.publicationDate.slice(0,4))<=expected.yearEnd)&&(!expected.ipc||p.ipc.some(code=>code.startsWith(expected.ipc!)))).map(p=>p.id));
    const membership=z.array(z.object({patent:z.string(),strategies:z.array(z.string()).min(1)})).parse(artifact.data.memberships);
    if(new Set(ids).size!==ids.length||ids.some(id=>!records.has(id)||!membership.some(m=>m.patent===id)))throw new Error('候选必须来自当前数据集且具有策略命中记录');
    const hits=z.array(z.object({name:z.string(),resultId:z.string()})).parse(artifact.data.strategies);
    const actual=new Map<string,Set<string>>();
    for(const hit of hits){
     const result=await store.savedResult(hit.resultId);
     if(!result||result.datasetId!==expected.datasetId||result.tool!=='search_patents'||result.status!=='completed')throw new Error('候选检索结果不存在或不属于当前数据集');
     actual.set(hit.name,new Set(result.rows.map(row=>String(row.patent))));
    }
    if(membership.some(m=>ids.includes(m.patent)&&m.strategies.some(name=>!actual.get(name)?.has(m.patent))))throw new Error('候选命中路径与实际工具结果不一致');
   }
   if(stage==='comparison'&&task.workflow==='novelty-search'){
    const features=(await client.query("SELECT revision,data FROM professional_artifacts WHERE task_id=$1 AND stage='features' AND status='confirmed' ORDER BY revision DESC LIMIT 1",[id])).rows[0];
    const candidates=(await client.query("SELECT revision,data FROM professional_artifacts WHERE task_id=$1 AND stage='retrieval' AND status='confirmed' ORDER BY revision DESC LIMIT 1",[id])).rows[0];
    if(!features||!candidates||artifact.data.featureRevision!==features.revision||artifact.data.candidateRevision!==candidates.revision)throw new Error('对比依据版本已改变');
    const expected=professionalInput.parse(task.input);if(expected.workflow!=='novelty-search')throw new Error('任务类型不匹配');
    const source=validateProposalArtifact(expected.proposal,features.data),store=new PostgresStore(this.pool),records=await store.analysisPatents(expected.datasetId);
    const documents=z.array(z.object({patentId:z.string(),sourceChunks:z.array(z.unknown()),batches:z.array(z.object({startOrdinal:z.number().int().nonnegative(),endOrdinal:z.number().int().nonnegative(),comparisons:z.unknown()}))})).parse(artifact.data.documents);
    if(documents.length!==candidates.data.patentIds.length||new Set(documents.map(d=>d.patentId)).size!==documents.length)throw new Error('对比文献必须覆盖全部确认候选');
    for(const document of documents){
     const record=records.find(p=>p.id===document.patentId);if(!record||!candidates.data.patentIds.includes(document.patentId))throw new Error('对比文献不属于确认候选');
     const chunks=chunkPatent(await store.fullPatent(expected.datasetId,record),'novelty-'+id+'-candidates-'+candidates.revision,{maxChars:4000,maxClaimChars:4000});
     if(!isDeepStrictEqual(document.sourceChunks,chunks))throw new Error('对比原文已改变，请重新执行');
     const covered=new Set<number>();
     for(const batch of document.batches){const selected=chunks.filter(c=>c.ordinal>=batch.startOrdinal&&c.ordinal<=batch.endOrdinal);if(!selected.length)throw new Error('对比批次原文范围无效');validateComparisonRows(source.features,selected,batch.comparisons);for(const chunk of selected)covered.add(chunk.ordinal);}
     if(covered.size!==chunks.length)throw new Error('对比尚未覆盖全部保存的原文片段');
    }
   }
   if(stage==='entities'){
    const mappings=entityMapping.parse(artifact.data.mappings);
    const expected=professionalInput.parse(task.input);if(expected.workflow!=='competitor-analysis')throw new Error('主体阶段与任务类型不一致');
    if(mappings.length!==expected.entities.length||expected.entities.some(entity=>!mappings.some(group=>group.entity===entity)))throw new Error('确认主体必须与输入主体一致');
    const names=new Set((await new PostgresStore(this.pool).analysisPatents(expected.datasetId)).flatMap(p=>p.applicants));
    if(mappings.some(group=>group.aliases.some(alias=>!names.has(alias))))throw new Error('别名必须来自当前数据集真实申请人名称');
   }
   const workflow=PROFESSIONAL_WORKFLOWS.find(w=>w.id===task.workflow&&w.version===task.workflow_version);if(!workflow)throw new Error('流程版本不可用');
   const next=workflow.stages[workflow.stages.findIndex(s=>s.id===stage)+1];
   await client.query("UPDATE professional_artifacts SET status='confirmed',confirmed_by=$4,confirmed_at=now() WHERE task_id=$1 AND stage=$2 AND revision=$3",[id,stage,revision,scope.userId]);
   return (await client.query('UPDATE professional_tasks SET current_stage=$2,status=$3,updated_at=now() WHERE id=$1 RETURNING *',[id,next?.id||stage,next?'ready':'completed'])).rows[0];
  });
 }
}
