import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export function inventorySqlite(path:string){
 const db=new DatabaseSync(path,{readOnly:true});
 try{
  db.exec('BEGIN');
  const tables=(db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as {name:string;sql:string}[]).map(table=>{
   const name='"'+table.name.replaceAll('"','""')+'"';
   const columns=db.prepare(`PRAGMA table_info(${name})`).all();
   const count=Number(db.prepare(`SELECT count(*) AS n FROM ${name}`).get()!.n);
   const hasPayload=columns.some(column=>column.name==='payload');
   const invalidJson=hasPayload?Number(db.prepare(`SELECT count(*) AS n FROM ${name} WHERE payload IS NOT NULL AND NOT json_valid(payload)`).get()!.n):0;
   return {...table,columns,count,invalidJson};
  });
  const names=new Set(tables.map(table=>table.name));
  const relations=[
   ['patents','dataset_id','datasets','id'],
   ['conversations','dataset_id','datasets','id'],
   ['runs','conversation_id','conversations','id'],
   ['events','run_id','runs','id'],
   ['reports','run_id','runs','id'],
   ['claim_checkpoints','dataset_id','datasets','id'],
   ['effect_checkpoints','dataset_id','datasets','id'],
  ].filter(([child,,parent])=>names.has(child)&&names.has(parent)).map(([child,column,parent,key])=>({
   child,column,parent,key,
   missingParents:Number(db.prepare(`SELECT count(*) AS n FROM ${child} c WHERE NOT EXISTS (SELECT 1 FROM ${parent} p WHERE p.${key}=c.${column})`).get()!.n),
  }));
  // Reports retain snapshots independently; missing source runs are not necessarily corruption.
  return {path:resolve(path),tables,relations};
 }finally{db.close();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const path=process.argv[2];
 if(!path)throw new Error('Usage: npx tsx scripts/inventory-sqlite.ts <sqlite-file>');
 console.log(JSON.stringify(inventorySqlite(path),null,2));
}
