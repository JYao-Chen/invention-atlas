import {existsSync,createWriteStream} from 'node:fs';
import {mkdir,rename,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {Pool} from 'pg';
import {VERSION,RELEASE,importBundle} from './bundle';
const args=process.argv.slice(2),options:{directory?:string;coreOnly?:boolean;project?:string}={};
for(let i=0;i<args.length;i++){
 if(args[i]==='--core-only')options.coreOnly=true;
 else if(args[i]==='--directory'&&args[i+1])options.directory=args[++i];
 else if(args[i]==='--project'&&args[i+1])options.project=args[++i];
 else throw new Error('支持参数：--core-only、--directory 路径、--project 项目编号');
}
if(!process.env.MAINTENANCE_DATABASE_URL)throw new Error('请先执行 npm run setup，或配置 MAINTENANCE_DATABASE_URL');
const root=resolve(options.directory||'data/demo/'+VERSION);await mkdir(root,{recursive:true});
const pool=new Pool({connectionString:process.env.MAINTENANCE_DATABASE_URL});
try{
 const targets=(await pool.query("SELECT u.id AS \"userId\",p.organization_id AS \"organizationId\",p.project_id AS \"projectId\" FROM users u JOIN project_members p ON p.user_id=u.id WHERE u.username=$1 AND p.role='owner' AND ($2::text IS NULL OR p.project_id=$2) ORDER BY p.project_id",[process.env.PATENT_USERNAME,options.project||null])).rows;
 if(targets.length!==1)throw new Error('需要指定一个拥有的目标项目；多个项目时使用 --project 项目编号');
 for(const name of options.coreOnly?['core']:['core','papers']){
  const file=resolve(root,name+'.jsonl.gz');
  if(!existsSync(file)){
   if(options.directory)throw new Error('本地文件不存在：'+file);
   console.log('正在下载 '+VERSION+'/'+name+'…');
   const response=await fetch(RELEASE+name+'.jsonl.gz');if(!response.ok||!response.body)throw new Error('下载失败：HTTP '+response.status);
   try{await pipeline(Readable.fromWeb(response.body as never),createWriteStream(file+'.part'));await rename(file+'.part',file);}catch(error){await rm(file+'.part',{force:true});throw error;}
  }
  console.log('正在导入 '+name+'…');
  const result=await importBundle(pool,file,targets[0]);console.log(result.skipped?name+' 已导入，本次跳过':name+' 导入完成：'+JSON.stringify(result.counts));
 }
 console.log('演示数据准备完成。启动网页与 worker 后，用本机账号登录即可查看。');
}finally{await pool.end();}
