import {z} from 'zod';
import type {Pool} from 'pg';
import {ReportReviews} from './report-reviews';
import {RetrievalExperiments} from './retrieval-experiments';

export async function humanAiReviewEndpoint(request:Request,path:string[],pool:Pool):Promise<Response|undefined>{
 const [resource,id,action,reviewId]=path,method=request.method,params=new URL(request.url).searchParams,headers={'Cache-Control':'no-store'};
 const json=(value:unknown,status=200)=>Response.json(value,{status,headers});
 const unsupported=()=>json({error:'不支持该操作'},405);
 if(resource==='reports'&&id&&['conclusions','reviews','review-statistics'].includes(action)){
  const reviews=new ReportReviews(pool),revision=()=>z.coerce.number().int().min(0).parse(params.get('version')??0);
  if(action==='conclusions'&&path.length===3)return method==='GET'?json({conclusions:await reviews.conclusions(id,revision())}):unsupported();
  if(action==='review-statistics'&&path.length===3)return method==='GET'?json(await reviews.statistics(id,revision())):unsupported();
  if(action==='reviews'){
   if(path.length===3){if(method==='GET')return json({reviews:await reviews.list(id,revision())});if(method==='POST')return json(await reviews.start(id,await request.json()),201);}
   if(path.length===4&&reviewId&&method==='PATCH')return json(await reviews.submit(id,reviewId,await request.json()));
  }
  return unsupported();
 }
 if(resource==='retrieval-experiments'){
  const experiments=new RetrievalExperiments(pool);
  if(path.length===1){if(method==='POST')return json(await experiments.create(await request.json()),201);if(method==='GET'){const offset=z.coerce.number().int().nonnegative().safe().parse(params.get('offset')??0),records=await experiments.list(offset);return json({records,offset,nextOffset:records.length===50?offset+50:null});}}
  if(path.length===2&&id&&method==='GET')return json(await experiments.get(id));
  if(path.length===3&&id&&action==='compare'&&method==='POST')return json(await experiments.compare(id,await request.json()));
  return unsupported();
 }
}
