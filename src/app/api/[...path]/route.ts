import {NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import {micromark} from 'micromark';
import {gfm,gfmHtml} from 'micromark-extension-gfm';
import {db,datasets,dataset,patents,setting,newConversation,conversations,runs,run,saveReport,reports,saveDataset,saveResult,savedResults,events,savePatent,updateDataset,saveRun} from '@/server/db';
import {authenticate,login,logout,authorized,COOKIE} from '@/server/auth';
import {TOOL_DEFS,executeTool,capability} from '@/server/tools';
import {toolDefaults} from '@/server/planning';
import {nameClusterTopics} from '@/server/cluster-topics';
import {startRun,stopRun,isActive,retryReport} from '@/server/agent';
import {importText,datasetMeta} from '@/server/importers';
import {modelConfig,publicModelSettings,resolveModelSettings,saveModelSettings} from '@/server/config';
import {embed,chat} from '@/server/model';
import type {Patent} from '@/lib/types';
import {entityRulesSchema} from '@/server/research';
import {judgmentSchema,evaluateRun} from '@/server/evaluation';
import {enrichmentSchema,enrichBatch} from '@/server/enrichment-job';
import {acquisitionSchema,acquireDlt} from '@/server/acquisition';
export const runtime='nodejs';export const dynamic='force-dynamic';
const escape=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
async function handle(request:Request,{params}:{params:Promise<{path:string[]}>}){try{
 const {path}=await params;const [resource,id,action]=path;const url=new URL(request.url);const method=request.method;
 if(resource==='login'&&method==='POST'){const body=await request.json();if(!authenticate(String(body.username||''),String(body.password||'')))return NextResponse.json({error:'用户名或密码错误'},{status:401});const response=NextResponse.json({ok:true});response.cookies.set(COOKIE,login(),{httpOnly:true,sameSite:'lax',path:'/',maxAge:7*86400});return response;}
 if(!authorized(request))return NextResponse.json({error:'请先登录'},{status:401});
 if(resource==='logout'){logout(request);const response=NextResponse.json({ok:true});response.cookies.delete(COOKIE);return response;}
 if(resource==='health')return NextResponse.json({ok:true,app:'invention-atlas',dataset:dataset(),model:modelConfig().model,modelConfigured:Boolean(modelConfig().key)});
 if(resource==='entities'){const datasetId=url.searchParams.get('dataset')||dataset()?.id;if(!datasetId||!dataset(datasetId))throw new Error('数据集不存在');const key='entities:'+datasetId;if(method==='PATCH'){if(runs().some(r=>r.datasetId===datasetId&&isActive(r.id)))throw new Error('请等待当前数据集分析结束再改归并规则');const rules=entityRulesSchema.parse((await request.json()).rules);setting(key,JSON.stringify(rules));}return NextResponse.json({rules:JSON.parse(setting(key)||'[]')});}
 if(resource==='acquisition'&&method==='POST'){const input=acquisitionSchema.parse(await request.json()),encoder=new TextEncoder(),control=new AbortController();request.signal.addEventListener('abort',()=>control.abort(),{once:true});const stream=new ReadableStream({start(output){const send=(event:string,data:unknown)=>{if(!control.signal.aborted)output.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));};void acquireDlt(input,control.signal,data=>send('progress',data)).then(meta=>send('done',{dataset:meta})).catch(e=>send('error',{error:(e as Error).message})).finally(()=>{if(!control.signal.aborted)output.close();});},cancel(){control.abort();}});return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-cache','X-Accel-Buffering':'no'}});}
 if(resource==='evaluations'){const r=run(id);if(!r)throw new Error('运行不存在');if(r.status==='running')throw new Error('请在运行结束后评审');const key='evaluation:'+id;if(method==='POST'){const judgment=judgmentSchema.parse({...await request.json(),runId:id});const outcome=evaluateRun(r,patents(r.datasetId),judgment);setting(key,JSON.stringify({judgment,outcome,reviewedAt:new Date().toISOString()}));return NextResponse.json({judgment,outcome});}const saved=setting(key);return NextResponse.json(saved?JSON.parse(saved):{outcome:evaluateRun(r,patents(r.datasetId))});}
 if(resource==='enrichment'&&method==='POST'){const input=enrichmentSchema.parse(await request.json());const encoder=new TextEncoder(),controller=new AbortController();request.signal.addEventListener('abort',()=>controller.abort(),{once:true});const stream=new ReadableStream({start(output){const send=(name:string,data:unknown)=>{if(!controller.signal.aborted)output.enqueue(encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`));};void enrichBatch(input,controller.signal,data=>send('progress',data)).then(results=>send('done',{results})).catch(e=>send('error',{error:(e as Error).message})).finally(()=>{if(!controller.signal.aborted)output.close();});},cancel(){controller.abort();}});return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-cache','X-Accel-Buffering':'no'}});}
 if(resource==='results')return NextResponse.json({results:savedResults(url.searchParams.get('dataset')||dataset()?.id||'')});
 if(resource==='settings'){
  if(method==='PATCH'){if(runs().some(r=>isActive(r.id)))throw new Error('请等待正在运行的分析结束后再更改模型配置');saveModelSettings(await request.json());return NextResponse.json(publicModelSettings());}
  if(method==='POST'){const body=await request.json();const cfg=Object.keys(body).length?resolveModelSettings(body):modelConfig();await chat('只回复：连接正常','测试模型连接',{config:cfg});return NextResponse.json({ok:true,model:cfg.model});}
  if(method==='GET')return NextResponse.json(publicModelSettings());
  return NextResponse.json({error:'不支持此操作'},{status:405});
 }
 if(resource==='datasets'){
  if(method==='GET')return NextResponse.json({datasets:datasets(),active:dataset()?.id});
  if(method==='PATCH'){const {id:next}=await request.json();if(!dataset(next))throw new Error('数据集不存在');setting('active_dataset',next);return NextResponse.json({ok:true});}
  if(method==='POST'){const form=await request.formData();const files=form.getAll('files') as File[];if(!files.length)throw new Error('请添加导入文件');const format=String(form.get('format')||'canonical');const records:Patent[]=[];for(const file of files){if(file.size>32*1024*1024)throw new Error('单个文件不能超过32MB');records.push(...importText(await file.text(),format,file.name));}const unique=[...new Map(records.map(p=>[p.id,p])).values()];if(!unique.length)throw new Error('未解析到有效专利');const meta=datasetMeta(String(form.get('name')||files[0].name),unique,'用户文件导入','用户上传；请依据来源说明判断覆盖范围');saveDataset(meta,unique);return NextResponse.json({dataset:meta,duplicates:records.length-unique.length});}
 }
 if(resource==='index'&&method==='POST'){const meta=dataset((await request.json()).datasetId);if(!meta)throw new Error('数据集不存在');const records=patents(meta.id).filter(p=>!p.embedding);for(let i=0;i<records.length;i+=10){const batch=records.slice(i,i+10);const vectors=await embed(batch.map(p=>p.title+'\n'+p.abstract),request.signal);batch.forEach((p,j)=>savePatent(meta.id,{...p,embedding:vectors[j]}));}meta.indexed=patents(meta.id).filter(p=>p.embedding).length;updateDataset(meta);return NextResponse.json({indexed:meta.indexed});}
 if(resource==='patents'){const meta=dataset(url.searchParams.get('dataset')||undefined);if(!meta)throw new Error('数据集不存在');const records=patents(meta.id);if(id){const p=records.find(p=>p.id===id);if(!p)return NextResponse.json({error:'专利不存在'},{status:404});return NextResponse.json(p);}const query=(url.searchParams.get('q')||'').toLowerCase();const selected=records.filter(p=>!query||(p.id+' '+p.title+' '+p.applicants.join(' ')).toLowerCase().includes(query));const page=Math.max(1,Number(url.searchParams.get('page')||1));return NextResponse.json({total:selected.length,page,records:selected.slice((page-1)*20,page*20).map(({embedding,rawText,description,claims,...p})=>({...p,claimCount:claims.length,descriptionChars:description.length}))});}
 if(resource==='tools'){const meta=dataset(url.searchParams.get('dataset')||undefined);if(!meta)throw new Error('数据集不存在');const records=patents(meta.id);if(method==='GET')return NextResponse.json({tools:TOOL_DEFS.map(([name,title,group])=>({name,title,group,defaultParams:toolDefaults(name,records),...capability(name,records)}))});const body=await request.json();const selectedMeta=dataset(body.datasetId)||meta;const result=await executeTool(id,body.params||{},selectedMeta,patents(selectedMeta.id),{entityRules:entityRulesSchema.parse(JSON.parse(setting('entities:'+selectedMeta.id)||'[]')),semantic:body.semantic!==false,nameTopics:nameClusterTopics,signal:request.signal});saveResult(result);return NextResponse.json(result);}
 if(resource==='conversations'){
  if(method==='GET'){if(id){const c=conversations().find(c=>c.id===id);if(!c)return NextResponse.json({error:'对话不存在'},{status:404});const saved=runs(id);for(const r of saved)if(r.status==='running'&&!isActive(r.id)){r.status='interrupted';r.error='运行进程已结束；已完成工具保留，可仅重试报告';saveRun(r);}return NextResponse.json({conversation:c,runs:saved});}return NextResponse.json({conversations:conversations()});}
  if(method==='POST'){const body=await request.json();const meta=dataset(body.datasetId);if(!meta)throw new Error('数据集不存在');return NextResponse.json(newConversation(meta.id,body.title));}
  if(method==='PATCH'){const body=await request.json();if(!String(body.title||'').trim())throw new Error('名称不能为空');db.prepare('UPDATE conversations SET title=? WHERE id=?').run(String(body.title).slice(0,100),id);return NextResponse.json({ok:true});}
  if(method==='DELETE'){if(runs(id).some(r=>isActive(r.id)))throw new Error('请先停止正在运行的任务');db.prepare('DELETE FROM conversations WHERE id=?').run(id);db.prepare('DELETE FROM runs WHERE conversation_id=?').run(id);return NextResponse.json({ok:true});}
 }
 if(resource==='runs'){
  if(method==='POST'&&!id){const body=await request.json();const question=String(body.question||'').trim();if(!question||question.length>12000)throw new Error('问题应为1至12000字符');if(runs(body.conversationId).some(r=>isActive(r.id)))throw new Error('该对话已有任务在运行');if(body.mode==='tool'&&(!Array.isArray(body.steps)||body.steps.length!==1))throw new Error('直接工具任务必须指定一项工具');const r=startRun(body.conversationId,body.datasetId,question,body.steps,body.mode==='tool');const c=conversations().find(c=>c.id===body.conversationId);if(c?.title==='新对话')db.prepare('UPDATE conversations SET title=? WHERE id=?').run(question.slice(0,40),c.id);return NextResponse.json(r,{status:202});}
  if(action==='stop'){stopRun(id);return NextResponse.json({ok:true});}
  if(action==='retry-report')return NextResponse.json(await retryReport(id),{status:202});
  const r=run(id);if(!r)return NextResponse.json({error:'运行不存在'},{status:404});
  if(action==='events'){
   let after=Number(url.searchParams.get('after')||0),closed=false;const encoder=new TextEncoder();let timer:ReturnType<typeof setTimeout>;
   const stream=new ReadableStream({start(controller){const poll=()=>{if(closed)return;const batch=events(id,after);try{for(const e of batch){after=e.seq;controller.enqueue(encoder.encode(`id: ${e.seq}\nevent: ${e.event}\ndata: ${e.payload}\n\n`));}if(run(id)?.status!=='running'){closed=true;controller.close();return;}timer=setTimeout(poll,250);}catch{closed=true;}};poll();request.signal.addEventListener('abort',()=>{closed=true;clearTimeout(timer);try{controller.close();}catch{}},{once:true});},cancel(){closed=true;clearTimeout(timer);}});
   return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-cache','X-Accel-Buffering':'no'}});
  }
  return NextResponse.json(r);
 }
 if(resource==='reports'){
  if(method==='POST'){const body=await request.json();const r=run(body.runId);if(!r||!r.results.length||r.status==='running')throw new Error('请选择已结束且有工具结果的运行');return NextResponse.json({id:saveReport(r,String(body.title||r.question.slice(0,60)))});}
  const all=reports();if(!id)return NextResponse.json({reports:all});const report=all.find(r=>r.id===id);if(!report)return NextResponse.json({error:'报告不存在'},{status:404});const snapshot=report.run;const exportedAnswer=snapshot.answer.replace(/\[\[chart:([^\]]+)\]\]/g,(_,id)=>'【工具结果：'+(snapshot.results.find(r=>r.id===id)?.title||'未保存')+'】');
  if(action==='markdown')return new Response(exportedAnswer,{headers:{'Content-Type':'text/markdown; charset=utf-8','Content-Disposition':`attachment; filename="patent-report-${id}.md"`}});
  if(action==='html'){const narrative=micromark(exportedAnswer,{extensions:[gfm()],htmlExtensions:[gfmHtml()]});const tables=snapshot.results.map(result=>{const keys=[...new Set(result.rows.flatMap(row=>Object.keys(row)))];return `<section><h2>${escape(result.title)}</h2><p>${escape(result.summary)}</p><p>${escape(result.method)}</p><div class="table"><table><thead><tr>${keys.map(key=>`<th>${escape(key)}</th>`).join('')}</tr></thead><tbody>${result.rows.map(row=>`<tr>${keys.map(key=>`<td>${escape(typeof row[key]==='object'?JSON.stringify(row[key]):row[key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p>${result.warnings.map(escape).join('<br>')}</p></section>`;}).join('');return new Response(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>${escape(report.title)}</title><style>body{font:16px/1.7 system-ui;margin:40px auto;max-width:1100px;color:#24344b;padding:0 24px}section{margin:32px 0}.table{overflow:auto}table{border-collapse:collapse;font-size:13px}td,th{border:1px solid #d6dce5;padding:8px;text-align:left;max-width:380px;overflow-wrap:anywhere}a{color:#205bc1}</style><body><h1>${escape(report.title)}</h1><p>历史运行 · 数据集 ${escape(snapshot.datasetId)} · ${escape(snapshot.model)} · ${escape(snapshot.createdAt)}</p>${narrative}${tables}</body></html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Content-Disposition':`attachment; filename="patent-report-${id}.html"`}});}
  return NextResponse.json(report);
 }
 return NextResponse.json({error:'接口不存在'},{status:404});
 }catch(e){return NextResponse.json({error:(e as Error).message||'请求失败'},{status:400});}}
export {handle as GET,handle as POST,handle as PATCH,handle as DELETE};
