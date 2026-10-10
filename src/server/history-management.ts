import {z} from 'zod';
import {db,runs} from './db';

const idsSchema=z.array(z.string().trim().min(1)).min(1);
export function deleteSaved(kind:'reports'|'conversations',input:unknown,isActive:(id:string)=>boolean=()=>false){
 const ids=[...new Set(idsSchema.parse(input))];
 const find=db.prepare(`SELECT id FROM ${kind} WHERE id=?`);
 for(const id of ids){
  if(!find.get(id))throw new Error(kind==='reports'?'报告不存在':'对话不存在');
  if(kind==='conversations'&&runs(id).some(r=>isActive(r.id)))throw new Error('请先停止选中对话中正在运行的任务');
 }
 db.exec('BEGIN');
 try{
  for(const id of ids){
   if(kind==='conversations'){
    const saved=runs(id);
    for(const r of saved){db.prepare('DELETE FROM events WHERE run_id=?').run(r.id);db.prepare('DELETE FROM settings WHERE key=?').run('evaluation:'+r.id);}
    db.prepare('DELETE FROM runs WHERE conversation_id=?').run(id);
   }
   db.prepare(`DELETE FROM ${kind} WHERE id=?`).run(id);
  }
  db.exec('COMMIT');return {deleted:ids.length,ids};
 }catch(error){db.exec('ROLLBACK');throw error;}
}
