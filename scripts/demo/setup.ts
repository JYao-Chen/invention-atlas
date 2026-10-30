import {existsSync} from 'node:fs';
import {readFile,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {parseEnv} from 'node:util';
import {spawnSync} from 'node:child_process';
import {Pool} from 'pg';
import {migratePostgres} from '../../src/server/postgres';
import {IdentityStore} from '../../src/server/identity';
const path='.env.local';
if(!existsSync(path)){
 const password=randomBytes(18).toString('hex'),runtime=randomBytes(24).toString('hex'),queue=randomBytes(24).toString('hex');
 const connection=(user:string,key:string)=>'postgresql://'+user+':'+key+'@127.0.0.1:55418/invention_atlas_demo';
 const values={PATENT_USERNAME:'admin',PATENT_PASSWORD:randomBytes(12).toString('hex'),PATENT_MODEL_CREDENTIAL_KEY:randomBytes(32).toString('hex'),ATLAS_DEMO_DB_PASSWORD:password,ATLAS_DEMO_DB_PORT:'55418',MAINTENANCE_DATABASE_URL:connection('atlas_owner',password),DATABASE_URL:connection('atlas_runtime',runtime),QUEUE_DATABASE_URL:connection('atlas_queue',queue)};
 let template=await readFile('.env.example','utf8');
 for(const [key,value] of Object.entries(values))template=new RegExp('^'+key+'=.*$','m').test(template)?template.replace(new RegExp('^'+key+'=.*$','m'),key+'='+value):template+'\n'+key+'='+value+'\n';
 await writeFile(path,template,{mode:0o600,flag:'wx'});console.log('已生成 .env.local；登录账号和随机密码保存在该文件中。');
}
const env={...parseEnv(await readFile(path,'utf8')),...process.env};
if(!env.MAINTENANCE_DATABASE_URL)throw new Error('已有 .env.local 保持原样。请设置 MAINTENANCE_DATABASE_URL，或先移开模板文件后重新运行 setup 以创建独立演示环境。');
if(!env.PATENT_USERNAME||!env.PATENT_PASSWORD||!env.DATABASE_URL||!env.QUEUE_DATABASE_URL)throw new Error('请填写账号、密码、运行连接与队列连接');
if(env.ATLAS_DEMO_DB_PASSWORD){
 const result=spawnSync('docker',['compose','--env-file',path,'-f','compose.demo.yml','up','-d','--wait'],{stdio:'inherit',env});if(result.error)throw result.error;if(result.status!==0)throw new Error('演示数据库启动失败；请确认 Docker 和 Docker Compose 可用');
}
const pool=new Pool({connectionString:env.MAINTENANCE_DATABASE_URL});
try{
 // All identifiers are fixed; passwords come from the private local environment.
 for(const [name,url,bypass] of [['atlas_runtime',env.DATABASE_URL,false],['atlas_queue',env.QUEUE_DATABASE_URL,true]] as const){
  const parsed=new URL(url);if(decodeURIComponent(parsed.username)!==name)throw new Error('初始化脚本使用固定运行角色 '+name);
  const password=decodeURIComponent(parsed.password);if(!password)throw new Error(name+' 需要数据库密码');
  if(!(await pool.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[name])).rowCount){
   const literal="'"+password.replaceAll("'","''")+"'";
   await pool.query('CREATE ROLE '+name+' LOGIN '+(bypass?'BYPASSRLS':'NOBYPASSRLS')+' PASSWORD '+literal);
  }
 }
 await migratePostgres(pool);
 await pool.query('GRANT USAGE ON SCHEMA public TO atlas_runtime,atlas_queue');
 await pool.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO atlas_runtime,atlas_queue');
 await pool.query('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO atlas_runtime,atlas_queue');
 await pool.query('REVOKE INSERT,UPDATE,DELETE ON external_sources,ext_patents,ext_patent_citations,ext_maintenance_events,ext_patent_paper_links,ext_papers,external_source_seeds FROM atlas_runtime');
 if(!(await pool.query('SELECT 1 FROM users LIMIT 1')).rowCount){await new IdentityStore(pool).initializeAdmin(env.PATENT_USERNAME,env.PATENT_PASSWORD,'Invention Atlas 演示');console.log('本机管理员与默认项目已创建。');}
 else console.log('账号已存在，保留已有账号和数据。');
 for(const url of [env.DATABASE_URL,env.QUEUE_DATABASE_URL]){const runtime=new Pool({connectionString:url});try{await runtime.query('SELECT 1');}finally{await runtime.end();}}
 console.log('初始化完成。下一步：npm run demo:import');
}finally{await pool.end();}
