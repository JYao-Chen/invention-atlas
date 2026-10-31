import type {Pool} from 'pg';
import type {RunnableConfig} from '@langchain/core/runnables';
import {BaseCheckpointSaver,WRITES_IDX_MAP,type Checkpoint,type CheckpointMetadata,type CheckpointListOptions,type CheckpointTuple,type PendingWrite} from '@langchain/langgraph-checkpoint';
import {connection,transaction} from './postgres';

/** Native LangGraph serialization keeps message instances and interrupted tool calls intact. */
export class ResearchCheckpointer extends BaseCheckpointSaver{
 constructor(private readonly pool:Pool,private readonly taskId:string){super();}
 private keys(config:RunnableConfig){
  if(config.configurable?.thread_id!==this.taskId)throw new Error('研究检查点不属于当前任务');
  return {ns:String(config.configurable?.checkpoint_ns||''),id:config.configurable?.checkpoint_id as string|undefined};
 }
 async getTuple(config:RunnableConfig):Promise<CheckpointTuple|undefined>{
  const {ns,id}=this.keys(config),db=connection(this.pool);
  const row=(await db.query('SELECT * FROM research_checkpoints WHERE task_id=$1 AND namespace=$2'+(id?' AND id=$3':' ORDER BY id DESC LIMIT 1'),id?[this.taskId,ns,id]:[this.taskId,ns])).rows[0];
  if(!row)return;
  const writes=(await db.query('SELECT * FROM research_checkpoint_writes WHERE task_id=$1 AND namespace=$2 AND checkpoint_id=$3 ORDER BY task_path COLLATE "C",writer_id COLLATE "C",idx',[this.taskId,ns,row.id])).rows;
  return {config:{configurable:{thread_id:this.taskId,checkpoint_ns:ns,checkpoint_id:row.id}},checkpoint:await this.serde.loadsTyped(row.value_type,row.value),metadata:row.metadata,
   parentConfig:row.parent_id?{configurable:{thread_id:this.taskId,checkpoint_ns:ns,checkpoint_id:row.parent_id}}:undefined,
   pendingWrites:await Promise.all(writes.map(async w=>[w.writer_id,w.channel,await this.serde.loadsTyped(w.value_type,w.value)] as [string,string,unknown]))};
 }
 async *list(config:RunnableConfig,options?:CheckpointListOptions){
  const {ns}=this.keys(config),rows=(await connection(this.pool).query('SELECT id,metadata FROM research_checkpoints WHERE task_id=$1 AND namespace=$2 ORDER BY id DESC',[this.taskId,ns])).rows;
  let count=0;
  for(const row of rows){if(options?.before?.configurable?.checkpoint_id&&row.id>=options.before.configurable.checkpoint_id)continue;if(options?.filter&&Object.entries(options.filter).some(([k,v])=>JSON.stringify(row.metadata[k])!==JSON.stringify(v)))continue;
   if(options?.limit!==undefined&&count>=options.limit)break;const tuple=await this.getTuple({configurable:{thread_id:this.taskId,checkpoint_ns:ns,checkpoint_id:row.id}});if(tuple){count++;yield tuple;}
  }
 }
 async put(config:RunnableConfig,checkpoint:Checkpoint,metadata:CheckpointMetadata){
  const {ns,id}=this.keys(config),[type,value]=await this.serde.dumpsTyped(checkpoint);
  await connection(this.pool).query('INSERT INTO research_checkpoints(task_id,namespace,id,parent_id,value_type,value,metadata) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(task_id,namespace,id) DO UPDATE SET value_type=excluded.value_type,value=excluded.value,metadata=excluded.metadata',[this.taskId,ns,checkpoint.id,id||null,type,Buffer.from(value),JSON.stringify(metadata)]);
  return {configurable:{thread_id:this.taskId,checkpoint_ns:ns,checkpoint_id:checkpoint.id}};
 }
 async putWrites(config:RunnableConfig,writes:PendingWrite[],taskId:string,taskPath=''){
  const {ns,id}=this.keys(config);if(!id)throw new Error('写入研究检查点需要检查点编号');
  await transaction(this.pool,async db=>{
   for(const [index,[channel,value]] of writes.entries()){
    const idx=WRITES_IDX_MAP[channel]??index,[type,bytes]=await this.serde.dumpsTyped(value);
    await db.query('INSERT INTO research_checkpoint_writes(task_id,namespace,checkpoint_id,writer_id,idx,channel,value_type,value,task_path) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(task_id,namespace,checkpoint_id,writer_id,idx) '+(idx<0?'DO UPDATE SET channel=excluded.channel,value_type=excluded.value_type,value=excluded.value,task_path=excluded.task_path':'DO NOTHING'),[this.taskId,ns,id,taskId,idx,channel,type,Buffer.from(bytes),taskPath]);
   }
  });
 }
 async deleteThread(threadId:string){
  this.keys({configurable:{thread_id:threadId}});
  await transaction(this.pool,async db=>{await db.query('DELETE FROM research_checkpoint_writes WHERE task_id=$1',[threadId]);await db.query('DELETE FROM research_checkpoints WHERE task_id=$1',[threadId]);});
 }
}
