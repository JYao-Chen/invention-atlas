import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Pool} from 'pg';
import type {ConclusionReview,ReportConclusion} from '../lib/types';
import {connection,currentAccess,transaction} from './postgres';
import {ReportVersions} from './report-versions';
import {reportConclusions} from './report-conclusions';

export const reviewEvidenceSchema=z.object({patentNumbers:z.array(z.string().trim().min(1).max(100)).max(1000).default([]),resultIds:z.array(z.string().min(1)).max(1000).default([])}).strict();
export const reviewDecisionSchema=z.object({decision:z.enum(['accept','modify','reject']),reason:z.string().trim().max(10000).default(''),modifiedText:z.string().trim().min(1).max(1000000).optional(),evidence:reviewEvidenceSchema.default({})}).strict().superRefine((v,ctx)=>{
 if(v.decision!=='accept'&&!v.reason)ctx.addIssue({code:'custom',path:['reason'],message:'修改或驳回必须填写理由'});
 if((v.decision==='modify')!==Boolean(v.modifiedText))ctx.addIssue({code:'custom',path:['modifiedText'],message:'仅修改操作必须提供修改后文本'});
});
const revisionSchema=z.number().int().min(0);
export function reviewStatistics(reviews:ConclusionReview[]){
 const latest=new Map<string,ConclusionReview>();
 for(const review of reviews){if(!review.submitted_at)continue;const key=JSON.stringify([review.report_id,review.revision,review.conclusion_id,review.reviewer_id]),old=latest.get(key);if(!old||+new Date(old.submitted_at!)<+new Date(review.submitted_at)||+new Date(old.submitted_at!)===+new Date(review.submitted_at)&&old.id<review.id)latest.set(key,review);}
 const groups=new Map<string,{dimension:string;key:string;reviews:ConclusionReview[]}>();
 for(const review of latest.values())for(const [dimension,keys] of [['report',[review.report_id]],['section',[review.conclusion.section]],['tool',review.conclusion.tools.length?review.conclusion.tools:['unattributed']]] as const){
  for(const key of new Set(keys)){const id=JSON.stringify([dimension,key]),group=groups.get(id)||{dimension,key,reviews:[]};group.reviews.push(review);groups.set(id,group);}
 }
 return [...groups.values()].map(({dimension,key,reviews:rows})=>{const count=rows.length,accept=rows.filter(r=>r.decision==='accept').length,modify=rows.filter(r=>r.decision==='modify').length,reject=rows.filter(r=>r.decision==='reject').length;return {dimension,key,count,accept,modify,reject,acceptRate:accept/count,modifyRate:modify/count,rejectRate:reject/count,averageDurationMs:rows.reduce((sum,r)=>sum+(+new Date(r.submitted_at!)-+new Date(r.started_at)),0)/count};});
}

export class ReportReviews{
 constructor(private readonly pool:Pool){}
 async conclusions(reportId:string,revision=0):Promise<ReportConclusion[]>{
  revisionSchema.parse(revision);const versions=new ReportVersions(this.pool),snapshot=await versions.snapshot(reportId,revision);
  const previous=revision?await versions.snapshot(reportId,revision-1):undefined;
  return reportConclusions(reportId,revision,snapshot.run.answer,snapshot.run.results,previous?reportConclusions(reportId,revision-1,previous.run.answer,previous.run.results):[]);
 }
 async list(reportId:string,revision=0):Promise<ConclusionReview[]>{
  await new ReportVersions(this.pool).snapshot(reportId,revisionSchema.parse(revision));
  return (await connection(this.pool).query('SELECT *,(extract(epoch FROM submitted_at-started_at)*1000)::double precision AS duration_ms FROM report_conclusion_reviews WHERE report_id=$1 AND revision=$2 ORDER BY started_at,id',[reportId,revision])).rows;
 }
 async start(reportId:string,input:unknown){
  const data=z.object({revision:revisionSchema,conclusionId:z.string().min(1)}).strict().parse(input),scope=currentAccess();if(!scope)throw new Error('复核需要项目身份');
  return transaction(this.pool,async db=>{
   const conclusion=(await this.conclusions(reportId,data.revision)).find(c=>c.id===data.conclusionId);if(!conclusion)throw new Error('结论条目不存在');
   return (await db.query('INSERT INTO report_conclusion_reviews(id,report_id,revision,conclusion_id,conclusion,organization_id,project_id,reviewer_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[randomUUID(),reportId,data.revision,conclusion.id,JSON.stringify(conclusion),scope.organizationId,scope.projectId,scope.userId])).rows[0] as ConclusionReview;
  });
 }
 async submit(reportId:string,id:string,input:unknown){
  const data=reviewDecisionSchema.parse(input);
  return transaction(this.pool,async db=>{
   const review=(await db.query('SELECT * FROM report_conclusion_reviews WHERE report_id=$1 AND id=$2',[reportId,id])).rows[0] as ConclusionReview|undefined;
   if(!review)throw new Error('复核记录不存在');
   if(review.submitted_at||review.reviewer_id!==currentAccess()?.userId)throw new Error('复核已提交或无提交权限');
   const snapshot=await new ReportVersions(this.pool).snapshot(reportId,review.revision);
   for(const resultId of data.evidence.resultIds)if(!snapshot.run.results.some(r=>r.id===resultId))throw new Error('证据结果不属于报告快照');
   const row=(await db.query('UPDATE report_conclusion_reviews SET submitted_at=clock_timestamp(),decision=$3,reason=$4,modified_text=$5,evidence=$6 WHERE report_id=$1 AND id=$2 AND submitted_at IS NULL AND reviewer_id=$7 RETURNING *,(extract(epoch FROM submitted_at-started_at)*1000)::double precision AS duration_ms',[reportId,id,data.decision,data.reason,data.modifiedText??null,JSON.stringify(data.evidence),currentAccess()?.userId||''])).rows[0];
   if(!row)throw new Error('复核已提交或无提交权限');return row as ConclusionReview;
  });
 }
 async statistics(reportId:string,revision=0){return {reportId,revision,unit:'latest submission per reviewer/conclusion/version',groups:reviewStatistics(await this.list(reportId,revision))};}
}
