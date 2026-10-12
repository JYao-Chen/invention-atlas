import {z} from 'zod';
import type {ProjectMaterials} from './project-materials';
export async function materialEndpoint(request:Request,path:string[],store:Pick<ProjectMaterials,'list'|'create'|'read'|'original'|'remove'|'restore'>){
 const [,id,action]=path,headers={'Cache-Control':'no-store'},method=request.method;
 if(path.length>3)return Response.json({error:'接口不存在'},{status:404,headers});
 if(!id&&method==='GET'){const offset=z.coerce.number().int().min(0).parse(new URL(request.url).searchParams.get('offset')||0);const materials=await store.list(offset);return Response.json({materials,offset,limit:50,nextOffset:materials.length===50?offset+50:null},{headers});}
 if(!id&&method==='POST'){const form=await request.formData(),file=form.get('file');if(!(file instanceof File))throw new Error('请选择材料文件');return Response.json(await store.create(file,request.signal),{status:201,headers});}
 if(id&&action==='original'&&method==='GET'){
  const file=await store.original(id),mime:Record<string,string>={pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',txt:'text/plain; charset=utf-8',md:'text/markdown; charset=utf-8'};
  return new Response(new Uint8Array(file.bytes),{headers:{...headers,'Content-Type':mime[file.format]||'application/octet-stream','Content-Disposition':`attachment; filename="material.${file.format}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`}});
 }
 if(id&&!action&&method==='GET')return Response.json(await store.read(id),{headers});
 if(id&&!action&&method==='DELETE')return Response.json(await store.remove(id),{headers});
 if(id&&!action&&method==='PATCH'){z.object({action:z.literal('restore')}).strict().parse(await request.json());return Response.json(await store.restore(id),{headers});}
 return Response.json({error:'不支持该操作'},{status:405,headers});
}
