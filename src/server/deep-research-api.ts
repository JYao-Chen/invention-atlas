import {NextResponse} from 'next/server';
import {z} from 'zod';
import {db} from './db';
import {modelConfig} from './config';
import {DeepResearchStore} from './deep-research-store';
export async function researchEndpoint(request:Request,path:string[]){
 if(path[0]!=='research-tasks')return;
 const [,id,action,chapterId]=path,tasks=new DeepResearchStore(db),method=request.method;
 if(method==='GET'&&!id)return NextResponse.json({tasks:await tasks.list()});
 if(method==='POST'&&!id)return NextResponse.json(await tasks.create(await request.json(),modelConfig().model),{status:202});
 const task=await tasks.get(id);if(!task)return NextResponse.json({error:'深度报告不存在'},{status:404});
 if(method==='GET'&&!action)return NextResponse.json(task);
 if(method==='GET'&&action==='versions'&&chapterId)return NextResponse.json({versions:await tasks.versions(id,chapterId)});
 if(method==='POST'&&action==='pause')return NextResponse.json(await tasks.pause(id));
 if(method==='POST'&&action==='confirm-outline'){const input=z.object({outline:z.unknown().optional()}).parse(await request.json());return NextResponse.json(await tasks.resume(id,true,input.outline),{status:202});}
 if(method==='POST'&&action==='resume')return NextResponse.json(await tasks.resume(id),{status:202});
 if(method==='POST'&&action==='feedback'){const {text}=z.object({text:z.string().trim().min(1).max(12000)}).parse(await request.json());await tasks.feedback(id,text);return NextResponse.json(await tasks.get(id));}
 return NextResponse.json({error:'没有此深度报告操作'},{status:405});
}
