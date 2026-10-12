import {Pool, type PoolClient,type QueryResult,type QueryResultRow} from 'pg';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {AsyncLocalStorage} from 'node:async_hooks';

const transactions=new AsyncLocalStorage<{pool:Pool;client:PoolClient}>();
export type AccessScope={userId:string;organizationId:string;projectId:string};
const access=new AsyncLocalStorage<AccessScope>();
const runtimeChecks=new WeakMap<Pool,Promise<void>>();
export const currentAccess=()=>access.getStore();
export function withAccess<T>(scope:AccessScope,work:()=>T):T{return access.run(scope,work);}
export const MIGRATIONS=['001_existing_business','002_historical_dataset_references','003_users_and_projects','004_resource_ownership','005_session_projects','006_fulltext_chunks','007_durable_jobs','008_professional_tasks','009_professional_execution','010_project_annotations','011_report_versions','012_report_comments','013_report_shares','014_report_tasks','015_task_notifications','016_report_publications','017_fulltext_jobs','018_technical_disclosures','019_monitor_subscriptions','020_monitor_subscription_runs','021_monitor_notifications','022_monitor_strategy_versions','023_monitor_notification_archive','024_source_update_history','025_source_observations','026_source_windows','027_source_update_jobs','028_source_update_decisions','029_source_update_proposals','030_project_api_credentials','031_monitor_source_revision'];

MIGRATIONS.push('032_source_update_schedules');
MIGRATIONS.push('033_project_materials');
MIGRATIONS.push('034_material_ocr_jobs');
MIGRATIONS.push('035_model_usage');
MIGRATIONS.push('036_model_usage_runs');
MIGRATIONS.push('037_model_call_budgets');
MIGRATIONS.push('038_model_call_counters');
MIGRATIONS.push('039_organization_models');
MIGRATIONS.push('040_material_ocr_parts');
MIGRATIONS.push('041_historical_events');
MIGRATIONS.push('042_comparison_checkpoint_keys');

export function assertRuntimeRole(pool:Pool){
 let check=runtimeChecks.get(pool);
 if(!check){
  check=pool.query("SELECT r.rolsuper,r.rolbypassrls,EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relname='datasets' AND n.nspname=current_schema() AND c.relowner=r.oid) AS owns_data FROM pg_roles r WHERE r.rolname=current_user").then(result=>{
   const role=result.rows[0];
   if(!role||role.rolsuper||role.rolbypassrls||role.owns_data)throw new Error('多用户运行连接不能使用超级用户、BYPASSRLS或业务表所有者');
  });
  runtimeChecks.set(pool,check);
 }
 return check;
}

class ScopedConnection {
 constructor(private readonly pool:Pool,private readonly scope:AccessScope){}
 async query<R extends QueryResultRow=any>(text:string,values?:unknown[]):Promise<QueryResult<R>>{
  return withAccess(this.scope,()=>transaction(this.pool,client=>client.query<R>(text,values)));
 }
}
export type SqlConnection={query<R extends QueryResultRow=any>(text:string,values?:unknown[]):Promise<QueryResult<R>>};
export function connection(pool:Pool):SqlConnection{
 const active=transactions.getStore();if(active?.pool===pool)return active.client;
 const scope=access.getStore();return scope?new ScopedConnection(pool,scope):pool;
}

export function postgresPool(connectionString=process.env.DATABASE_URL){
 if(!connectionString)throw new Error('DATABASE_URL is required for PostgreSQL');
 return new Pool({connectionString,max:10});
}

export async function transaction<T>(pool:Pool,work:(client:PoolClient)=>Promise<T>,options:{repeatableRead?:boolean;readOnly?:boolean}={}):Promise<T>{
 const active=transactions.getStore();
 if(active?.pool===pool)return work(active.client);
 if(access.getStore())await assertRuntimeRole(pool);
 const client=await pool.connect();
 try{
  await client.query('BEGIN'+(options.repeatableRead?' ISOLATION LEVEL REPEATABLE READ':'')+(options.readOnly?' READ ONLY':''));
  const scope=access.getStore();
  if(scope)await client.query("SELECT set_config('app.user_id',$1,true),set_config('app.organization_id',$2,true),set_config('app.project_id',$3,true)",[scope.userId,scope.organizationId,scope.projectId]);
  const result=await transactions.run({pool,client},()=>work(client));await client.query('COMMIT');return result;
 }
 catch(error){await client.query('ROLLBACK');throw error;}
 finally{client.release();}
}

export async function migratePostgres(pool:Pool){
 return transaction(pool,async client=>{
  await client.query('SELECT pg_advisory_xact_lock(3017001)');
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())');
  for(const version of MIGRATIONS){
   const applied=await client.query('SELECT version FROM schema_migrations WHERE version=$1',[version]);
   if(applied.rowCount)continue;
   await client.query(await readFile(resolve('migrations',version+'.sql'),'utf8'));
   await client.query('INSERT INTO schema_migrations(version) VALUES($1)',[version]);
  }
 });
}
