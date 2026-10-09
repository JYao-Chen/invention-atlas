import {chat} from './model';
import {run,saveRun,runs,analysisPatents,dataset} from './db';
import {TOOL_DEFS,capability} from './tools';

export function cleanFollowups(value:unknown,question:string):string[]{
 if(!Array.isArray(value))return [];
 return [...new Set(value.filter((v):v is string=>typeof v==='string').map(v=>v.trim()).filter(v=>v.length>=6&&v.length<=150&&v!==question.trim()))].slice(0,5);
}
export function questionLines(question:string,onQuestion:(value:string)=>void){
 let buffer='';const read=(line:string)=>{try{const q=cleanFollowups([JSON.parse(line).question],question)[0];if(q)onQuestion(q);}catch{}};
 return {push(text:string){buffer+=text;let end;while((end=buffer.indexOf('\n'))>=0){read(buffer.slice(0,end).trim());buffer=buffer.slice(end+1);}},finish(){if(buffer.trim())read(buffer.trim());buffer='';}};
}
type Job={questions:string[];listeners:Set<(questions:string[])=>void>;promise:Promise<string[]>};
const pending=new Map<string,Job>();
export async function followups(id:string,receive?:(questions:string[])=>void):Promise<string[]>{
 const saved=run(id);if(!saved)throw new Error('运行不存在');
 if(saved.followups?.length===5){receive?.(saved.followups);return saved.followups;}
 if(!['completed','partial'].includes(saved.status)||!saved.answer.trim())return [];
 let job=pending.get(id);
 if(!job){
  job={questions:[],listeners:new Set(),promise:Promise.resolve([])};pending.set(id,job);const currentJob=job;
  job.promise=(async()=>{
   const meta=dataset(saved.datasetId),records=meta?analysisPatents(meta.id):[];
   const tools=meta?TOOL_DEFS.filter(t=>capability(t[0],records).available).map(t=>t[1]):[];
   const history=runs(saved.conversationId).filter(r=>r.createdAt<saved.createdAt).slice(-2).map(r=>({question:r.question,answer:r.answer.slice(0,1200)}));
   const parser=questionLines(saved.question,q=>{if(currentJob.questions.length>=5||currentJob.questions.includes(q))return;currentJob.questions.push(q);for(const listener of currentJob.listeners)listener([...currentJob.questions]);});
   try{
    await chat('根据专利研究对话生成5个具体、简短、可直接发送的中文追问。严格输出JSONL，每行一个{"question":"问题"}，共5行，生成一条立即换行。不输出数组、编号、解释或Markdown。围绕本轮问题和回答继续研究，不重复已回答问题。分析建议只使用给定可用工具，不提全球实时检索、商业价格、侵权认定或不存在的资料。编号和主体只能来自给定内容；建议继续当前研究范围。功能咨询可推荐关联方法咨询。',JSON.stringify({history,question:saved.question,answer:saved.answer.slice(0,7000),kind:saved.kind,scope:saved.scope?{mode:saved.scope.mode,query:saved.scope.query,count:saved.scope.patentIds.length}:undefined,tools,results:saved.results.map(r=>({tool:r.tool,status:r.status,summary:r.summary}))}),{maxTokens:800,signal:AbortSignal.timeout(20000),onDelta:text=>parser.push(text)});
   }finally{
    parser.finish();const current=run(id);if(current&&current.status!=='running'&&current.answer===saved.answer&&currentJob.questions.length){current.followups=[...currentJob.questions];saveRun(current);}pending.delete(id);
   }
   return [...currentJob.questions];
  })();
 }
 if(receive){job.listeners.add(receive);if(job.questions.length)receive([...job.questions]);}
 try{return await job.promise;}finally{if(receive)job.listeners.delete(receive);}
}
