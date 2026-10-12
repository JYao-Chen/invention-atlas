import {z} from 'zod';
import type {Pool} from 'pg';
import type {Patent} from '../lib/types';
import {acquisitionSchema,readDltWindow} from './acquisition';
import {dltPatent} from './importers';
import {lexical} from './algorithms';
import {SourceUpdates} from './source-updates';
import {PostgresStore} from './postgres-store';
export const dltSourceUpdateInput=acquisitionSchema.omit({name:true}).extend({datasetId:z.string().min(1)}).strict();
export type SourceUpdateProgress={stage:'download'|'import';done?:number;total?:number;offset?:number;records?:number};
export async function updateDltSource(pool:Pool,input:unknown,signal:AbortSignal,progress:(value:SourceUpdateProgress)=>void|Promise<void>,request:typeof fetch=fetch,runId?:string){
 const data=dltSourceUpdateInput.parse(input);if(!await new PostgresStore(pool).dataset(data.datasetId))throw new Error('数据集不存在或无访问权限');
 const candidates:Patent[]=[],windows:{offset:number;retrievedAt:string;url:string;received:number;accepted:number}[]=[];
 for(let index=0;index<data.batches;index++){
  signal.throwIfAborted();const offset=data.offset+index*100;if(offset>=49025)break;
  await progress({stage:'download',done:index,total:data.batches,offset});const page=await readDltWindow(offset,signal,request),retrievedAt=new Date().toISOString();let accepted=0;
  for(const row of page.rows){if(row.truncated_cells?.length)continue;const patent=dltPatent(row.row);if(patent.id&&patent.title&&patent.abstract&&patent.description&&patent.claims.length){candidates.push(patent);accepted++;}}
  windows.push({offset,retrievedAt,url:'https://datasets-server.huggingface.co/rows?'+new URLSearchParams({dataset:'ExponentialScience/DLT-Patents',config:'default',split:'train',offset:String(offset),length:'100'}),received:page.rows.length,accepted});
 }
 signal.throwIfAborted();const unique=[...new Map(candidates.map(patent=>[patent.id,patent])).values()],records=data.query.trim()?lexical(unique,data.query).map(item=>item.p):unique;
 if(!records.length)throw new Error('源窗口没有符合字段及检索条件的完整记录；当前数据集未更新');
 await progress({stage:'import',records:records.length});signal.throwIfAborted();const updates=new SourceUpdates(pool),snapshot={datasetId:data.datasetId,sourceName:'ExponentialScience / DLT-Patents',sourceUrl:'https://huggingface.co/datasets/ExponentialScience/DLT-Patents',observedAt:windows.at(-1)!.retrievedAt,windows,records};const proposal=runId?await updates.stage(snapshot,runId):undefined;signal.throwIfAborted();const result=await updates.apply(proposal?.input||snapshot,runId);
 return {...result,windows,selected:records.length};
}
