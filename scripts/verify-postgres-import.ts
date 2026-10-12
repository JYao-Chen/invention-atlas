import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {postgresPool,transaction} from '../src/server/postgres';

const path=process.argv[2];
if(!path)throw new Error('Usage: DATABASE_URL=... npx tsx scripts/verify-postgres-import.ts <sqlite-file>');
const source=new DatabaseSync(path,{readOnly:true});
const pool=postgresPool();
const tables=['datasets','patents','conversations','runs','events','reports','monitors','settings','results','claim_checkpoints','effect_checkpoints','comparison_checkpoints'];
try{
 source.exec('BEGIN');
 const existing=new Set(source.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>String(row.name)));
 const verified=await transaction(pool,async client=>{
  await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
  const counts:Record<string,number>={};
  for(const table of tables){
   if(!existing.has(table))continue;
   const fields=source.prepare(`PRAGMA table_info(${table})`).all();
   const columns=fields.map(field=>String(field.name));
   const keys=fields.filter(field=>Number(field.pk)>0).sort((a,b)=>Number(a.pk)-Number(b.pk)).map(field=>String(field.name));
   const order=keys.join(',');
   const pgOrder=keys.map(key=>fields.find(field=>field.name===key)?.type==='TEXT'?`${key} COLLATE "C"`:key).join(',');
   const rows=source.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).iterate();
   await client.query(`DECLARE migration_rows NO SCROLL CURSOR FOR SELECT ${columns.join(',')} FROM ${table} ORDER BY ${pgOrder}`);
   let count=0;
   while(true){
    const batch=await client.query('FETCH 100 FROM migration_rows');
    if(!batch.rows.length)break;
    for(const actual of batch.rows){
     const expected=rows.next();
     if(expected.done)throw new Error(`Extra PostgreSQL row in ${table}`);
     for(const column of columns){
      const value:unknown=expected.value[column];
      const normalized:unknown=column==='payload'&&typeof value==='string'?JSON.parse(value):typeof value==='number'&&typeof actual[column]==='string'?String(value):value;
      assert.deepEqual(actual[column],normalized,`Migration mismatch: ${table} row ${count+1}, column ${column}`);
     }
     count++;
    }
   }
   if(!rows.next().done)throw new Error(`Missing PostgreSQL rows in ${table}`);
   await client.query('CLOSE migration_rows');
   counts[table]=count;
  }
  return counts;
 });
 console.log(JSON.stringify({verified},null,2));
}finally{source.close();await pool.end();}
