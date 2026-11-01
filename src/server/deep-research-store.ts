import {reportChapterBody} from '../lib/report-template';
import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {z} from 'zod';
import type {Run} from '../lib/types';
import type {DeepResearchTask,ResearchEvidence,ResearchOutlineItem,ResearchBrief,ResearchCycle} from '../lib/deep-research';
import {connection,currentAccess,transaction} from './postgres';
import {PostgresStore} from './postgres-store';
import {JobStore} from './job-store';
import {ModelBudget} from './model-budget';
import {researchEditorialIssues} from './research-editorial';

export class ResearchInputError extends Error{}

export const researchInput=z.object({datasetId:z.string().min(1),template:z.enum(['standard','academic','brief']).default('standard'),goal:z.string().trim().min(3).max(12000),mode:z.enum(['confirm_outline','automatic']).default('confirm_outline'),targetWords:z.number().int().min(1000).max(100000).default(20000),maxModelCalls:z.number().int().min(10).max(1000).default(120)});
export const briefSchema=z.object({intent:z.string().min(1).max(3000),audience:z.string().min(1).max(1000),scope:z.string().min(1).max(3000),questions:z.array(z.string().min(1).max(1000)).max(8),approach:z.array(z.string().min(1).max(1000)).min(1).max(12),changes:z.string().max(3000).default('')});
export const outlineSchema=z.array(z.object({id:z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),title:z.string().trim().min(1).max(160),question:z.string().trim().min(1).max(2000),targetWords:z.number().int().min(100).max(15000)})).min(2).max(50).refine(items=>new Set(items.map(i=>i.id)).size===items.length,'章节编号不能重复');
export function openResearchQuestions(cycles:ResearchCycle[]=[]){
 const latest=new Map<string,ResearchCycle>();for(const cycle of cycles)latest.set(cycle.question,cycle);
 return [...latest.values()].filter(c=>c.gaps.length&&!c.resolution);
}
export class DeepResearchStore{
 constructor(private readonly pool:Pool){}
 async list():Promise<DeepResearchTask[]>{return (await connection(this.pool).query('SELECT * FROM research_tasks ORDER BY updated_at DESC LIMIT 100')).rows;}
 async get(id:string):Promise<DeepResearchTask|undefined>{
  const db=connection(this.pool),task=(await db.query('SELECT * FROM research_tasks WHERE id=$1',[id])).rows[0];if(!task)return;
  task.chapters=(await db.query('SELECT id,body,findings,evidence_ids,revision,updated_at FROM research_chapters WHERE task_id=$1 ORDER BY id',[id])).rows;
  task.evidence=(await db.query('SELECT id,payload FROM research_evidence WHERE task_id=$1 ORDER BY created_at,id',[id])).rows;return task;
 }
 async create(raw:unknown,model:string){
  const input=researchInput.parse(raw),access=currentAccess();if(!access)throw new ResearchInputError('创建深度报告需要项目身份');
  return transaction(this.pool,async db=>{
   const store=new PostgresStore(this.pool),meta=await store.dataset(input.datasetId);if(!meta)throw new ResearchInputError('请选择数据集');
   const id=randomUUID(),conversation=await store.newConversation(meta.id,input.goal.slice(0,80));
   const run:Run={id,reportTemplate:input.template,kind:'research',conversationId:conversation.id,datasetId:meta.id,datasetSnapshot:meta,question:input.goal,status:'running',plan:[],results:[],answer:'',error:'',model,createdAt:new Date().toISOString(),progress:{tool:'research',unit:'正在准备深度研究'}};
   await store.saveRun(run);
   await db.query("INSERT INTO research_tasks(id,organization_id,project_id,actor_id,input,title,status) VALUES($1,$2,$3,$4,$5,$6,'queued')",[id,access.organizationId,access.projectId,access.userId,JSON.stringify(input),input.goal.slice(0,100)]);
   await new ModelBudget(this.pool).set(id,input.maxModelCalls);await new JobStore(this.pool).enqueue(id,'research',{});return (await this.get(id))!;
  });
 }
 async status(id:string,status:DeepResearchTask['status'],error=''){
  await connection(this.pool).query('UPDATE research_tasks SET status=$2,error=$3,updated_at=now() WHERE id=$1',[id,status,error]);
 }
 async outline(id:string,title:string,outline:ResearchOutlineItem[],brief?:ResearchBrief){
  const parsed=outlineSchema.parse(outline);
  return transaction(this.pool,async db=>{
   const t=(await db.query('SELECT * FROM research_tasks WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!t)throw new ResearchInputError('深度报告不存在');
   const saved=(await db.query('SELECT id FROM research_chapters WHERE task_id=$1',[id])).rows;
   if(saved.some(c=>!parsed.some(i=>i.id===c.id)))throw new ResearchInputError('已写章节须保留编号；调整标题、顺序或内容后可继续修订');
   const plan=brief?briefSchema.parse(brief):t.brief;
   const version={at:new Date().toISOString(),title,outline:parsed,brief:plan,request:t.feedback.at(-1)?.text||''};
   await db.query('UPDATE research_tasks SET title=$2,outline=$3,brief=$4,planning_history=planning_history||$5::jsonb,updated_at=now() WHERE id=$1',[id,title,JSON.stringify(parsed),plan?JSON.stringify(plan):null,JSON.stringify([version])]);
  });
 }
 async chapter(id:string,chapterId:string,body:string,findings:string,evidenceIds:string[]){
  const issues=researchEditorialIssues(body);if(issues.length)throw new ResearchInputError('请修改正文后重新保存：'+issues.join('、')+'。保留数据名称、数量、年份、计数口径、研究发现及影响判断的范围、缺失情况和不确定性，删除通用免责或人工复核套话。');
  return transaction(this.pool,async db=>{
   const task=(await db.query('SELECT * FROM research_tasks WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!task?.outline.some((c:ResearchOutlineItem)=>c.id===chapterId))throw new ResearchInputError('请先将章节加入提纲');
   const evidence=(await db.query('SELECT id FROM research_evidence WHERE task_id=$1 AND id=ANY($2::text[])',[id,evidenceIds])).rows;
   if(new Set(evidenceIds).size!==evidence.length)throw new ResearchInputError('章节引用了尚未登记的证据');
   for(const match of body.matchAll(/\[\[source:([^\]]+)\]\]/g))if(!evidenceIds.includes(match[1]))throw new ResearchInputError('正文引用须加入 evidenceIds');
   const previous=(await db.query('SELECT body,findings,evidence_ids,revision FROM research_chapters WHERE task_id=$1 AND id=$2',[id,chapterId])).rows[0];
   const selected=[...new Set(evidenceIds)].sort();
   if(previous&&previous.body===body&&previous.findings===findings&&JSON.stringify([...new Set(previous.evidence_ids)].sort())===JSON.stringify(selected))return {revision:previous.revision,changed:false};
   const r=(await db.query('INSERT INTO research_chapters(task_id,id,body,findings,evidence_ids,revision) VALUES($1,$2,$3,$4,$5,1) ON CONFLICT(task_id,id) DO UPDATE SET body=excluded.body,findings=excluded.findings,evidence_ids=excluded.evidence_ids,revision=research_chapters.revision+1,updated_at=now() RETURNING revision',[id,chapterId,body,findings,JSON.stringify(selected)])).rows[0];
   await db.query('INSERT INTO research_chapter_versions(task_id,chapter_id,revision,body,findings,evidence_ids) VALUES($1,$2,$3,$4,$5,$6)',[id,chapterId,r.revision,body,findings,JSON.stringify(selected)]);
   const chapter=task.outline.find((c:ResearchOutlineItem)=>c.id===chapterId)!;
   const record={at:new Date().toISOString(),question:'章节进展：'+chapter.title,finding:findings,evidenceIds:selected,gaps:[],nextAction:'章节已保存；具体未解问题继续按对应阶段记录处理，依据新发现补证或推进其余研究问题。',chapterIds:[chapterId]};
   await db.query('UPDATE research_tasks SET cycles=cycles||$2::jsonb,updated_at=now() WHERE id=$1',[id,JSON.stringify([record])]);return {...r,changed:true};
  });
 }
 async evidence(id:string,payload:ResearchEvidence['payload'],key:string=randomUUID()){
  await connection(this.pool).query('INSERT INTO research_evidence(task_id,id,payload) VALUES($1,$2,$3) ON CONFLICT(task_id,id) DO NOTHING',[id,key,JSON.stringify(payload)]);return key;
 }
 async cycle(id:string,cycle:Omit<ResearchCycle,'at'>){
  return transaction(this.pool,async db=>{
   const task=(await db.query('SELECT outline FROM research_tasks WHERE id=$1 FOR UPDATE',[id])).rows[0];
   if(!task)throw new ResearchInputError('深度报告不存在');
   if(cycle.chapterIds.some(ch=>!task.outline.some((item:ResearchOutlineItem)=>item.id===ch)))throw new ResearchInputError('研究记录涉及的章节不在当前提纲');
   const evidence=(await db.query('SELECT id FROM research_evidence WHERE task_id=$1 AND id=ANY($2::text[])',[id,cycle.evidenceIds])).rows;
   if(new Set(cycle.evidenceIds).size!==evidence.length)throw new ResearchInputError('研究记录引用了尚未登记的证据');
   if(cycle.resolution)z.object({kind:z.enum(['resolved','scoped']),reason:z.string().trim().min(10).max(2000)}).parse(cycle.resolution);
   const record={...cycle,at:new Date().toISOString()};
   await db.query('UPDATE research_tasks SET cycles=cycles||$2::jsonb,updated_at=now() WHERE id=$1',[id,JSON.stringify([record])]);
   return record;
  });
 }
 async feedback(id:string,text:string){
  await connection(this.pool).query("UPDATE research_tasks SET feedback=feedback||$2::jsonb,updated_at=now() WHERE id=$1",[id,JSON.stringify([{text,at:new Date().toISOString()}])]);
 }
 async pause(id:string){
  return transaction(this.pool,async()=>{
   const task=await this.get(id);if(!task)throw new ResearchInputError('深度报告不存在');if(!['queued','running'].includes(task.status))return task;
   const job=await new JobStore(this.pool).forRun(id);if(job)await new JobStore(this.pool).cancel(job.id);
   await this.status(id,'paused');const store=new PostgresStore(this.pool),run=await store.run(id);
   if(run&&job?.state==='queued'){run.status='interrupted';await store.saveRun(run);}return this.get(id);
  });
 }
 async resume(id:string,confirm=false,outline?:unknown,revision?:string){
  return transaction(this.pool,async db=>{
   const task=(await db.query('SELECT * FROM research_tasks WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!task)throw new ResearchInputError('深度报告不存在');
   if(!['awaiting_outline','paused','failed'].includes(task.status))throw new ResearchInputError('当前任务正在执行或已经完成');
   if(revision&&task.status!=='awaiting_outline')throw new ResearchInputError('请在方案等待确认时调整');
   if(task.status==='awaiting_outline'&&!confirm&&!revision)throw new ResearchInputError('请确认提纲后继续');
   const job=(await db.query('SELECT * FROM jobs WHERE run_id=$1 FOR UPDATE',[id])).rows[0];if(!job||job.state==='running')throw new ResearchInputError('后台正在保存暂停状态，请稍后继续');
   if(revision)await this.feedback(id,z.string().trim().min(1).max(12000).parse(revision));
   if(outline!==undefined)await this.outline(id,task.title,outlineSchema.parse(outline));
   const actor=currentAccess()?.userId;if(!actor)throw new ResearchInputError('继续研究需要项目身份');
   await db.query("UPDATE research_tasks SET status='queued',outline_confirmed=outline_confirmed OR $2,error='',updated_at=now() WHERE id=$1",[id,confirm]);
   await db.query("UPDATE jobs SET state='queued',actor_id=$2,attempts=0,worker_id=NULL,lease_until=NULL,cancel_requested=false,error='',updated_at=now() WHERE id=$1",[job.id,actor]);
   const store=new PostgresStore(this.pool),run=await store.run(id);if(!run)throw new ResearchInputError('研究运行不存在');run.status='running';run.error='';await store.saveRun(run);return this.get(id);
  });
 }
 async versions(id:string,chapterId:string){return (await connection(this.pool).query('SELECT revision,body,findings,evidence_ids,created_at FROM research_chapter_versions WHERE task_id=$1 AND chapter_id=$2 ORDER BY revision DESC',[id,chapterId])).rows;}
}

export function assembleResearchReport(task:DeepResearchTask){
 const chapters=task.chapters||[],evidence=new Map((task.evidence||[]).map(e=>[e.id,e])),used:string[]=[];
 const text=task.outline.map(item=>{
  const chapter=chapters.find(c=>c.id===item.id);if(!chapter?.body.trim())throw new ResearchInputError('章节尚未完成：'+item.title);
  return '## '+item.title+'\n\n'+reportChapterBody(chapter.body).replace(/\[\[source:([^\]]+)\]\]/g,(_,id:string)=>{if(!evidence.has(id))throw new ResearchInputError('来源不存在：'+id);if(!used.includes(id))used.push(id);return '['+(used.indexOf(id)+1)+']';});
 }).join('\n\n');
 const sources=used.map((id,index)=>{const e=evidence.get(id)!.payload;return `${index+1}. ${e.url?'['+e.title+']('+e.url+')':e.title}${e.field?' · '+e.field+'，位置 '+e.offset:''}${e.resultId?' · 分析结果 '+e.resultId:''}`;});
 return '# '+task.title+'\n\n'+text+(sources.length?'\n\n## 资料来源\n\n'+sources.join('\n\n'):'');
}
