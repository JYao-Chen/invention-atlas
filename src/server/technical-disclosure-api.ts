import {z} from 'zod';
import type {TechnicalDisclosures} from './technical-disclosure-store';
import {disclosureQuestions} from './disclosure-questions';
import {extractMaterial} from './material-extraction';

/** Called only inside projectRequest so all reads and writes use the selected scope. */
export async function disclosureEndpoint(request:Request,path:string[],store:Pick<TechnicalDisclosures,'list'|'read'|'create'|'update'|'remove'>){
 const [,id,action]=path,method=request.method,url=new URL(request.url);
 const headers={'Cache-Control':'no-store'};
 if(path.length>3)return Response.json({error:'接口不存在'},{status:404,headers});
 if(id==='extract'&&!action&&method==='POST'){
  const form=await request.formData(),file=form.get('file');
  if(!(file instanceof File))throw new Error('请选择材料文件');
  return Response.json(await extractMaterial(file,request.signal),{headers});
 }
 if(id&&action==='questions'&&method==='POST'){
  const {revision}=z.object({revision:z.number().int().positive()}).parse(await request.json());
  const record=await store.read(id,revision);
  const questions=await disclosureQuestions(record.snapshot.source,AbortSignal.any([request.signal,AbortSignal.timeout(90000)]));
  return Response.json({disclosureId:id,revision:record.revision,questions,saved:false},{headers});
 }
 if(method==='GET'&&id&&(!action||action==='markdown')){
  const value=url.searchParams.get('revision');
  const revision=value===null?undefined:z.coerce.number().int().positive().parse(value);
  const record=await store.read(id,revision);
  if(action==='markdown'){
   const draft=record.snapshot.draft;
   if(!draft)return Response.json({error:'材料尚未补齐，无法下载交底书草稿',questions:record.snapshot.questions},{status:409,headers});
   return new Response(draft.markdown,{headers:{...headers,'Content-Type':'text/markdown; charset=utf-8','Content-Disposition':`attachment; filename="disclosure-v${record.revision}.md"`}});
  }
  return Response.json(record,{headers});
 }
 if(!id&&method==='GET')return Response.json({disclosures:await store.list()},{headers});
 if(!id&&method==='POST')return Response.json(await store.create(await request.json()),{status:201,headers});
 if(id&&!action&&method==='PATCH')return Response.json(await store.update(id,await request.json()),{headers});
 if(id&&!action&&method==='DELETE'){await store.remove(id);return Response.json({ok:true},{headers});}
 return Response.json({error:'不支持该操作'},{status:405,headers});
}
