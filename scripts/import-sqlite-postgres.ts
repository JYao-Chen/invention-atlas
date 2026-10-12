import {DatabaseSync} from 'node:sqlite';
import {postgresPool,migratePostgres,transaction} from '../src/server/postgres';

const path=process.argv[2];
if(!path)throw new Error('Usage: DATABASE_URL=... npx tsx scripts/import-sqlite-postgres.ts <sqlite-file>');
const source=new DatabaseSync(path,{readOnly:true});
const pool=postgresPool();
const tables=['datasets','patents','conversations','runs','events','reports','monitors','settings','results','claim_checkpoints','effect_checkpoints','comparison_checkpoints'];
try{
 await migratePostgres(pool);
 source.exec('BEGIN');
 const existing=new Set(source.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>String(row.name)));
 await transaction(pool,async client=>{
  for(const table of tables){
   if(!existing.has(table))continue;
   const occupied=await client.query(`SELECT EXISTS(SELECT 1 FROM ${table}) occupied`);
   if(occupied.rows[0].occupied)throw new Error(`Target table ${table} is not empty; import aborted`);
  }
  const counts:Record<string,number>={};
  for(const table of tables){
   if(!existing.has(table))continue;
   const columns=source.prepare(`PRAGMA table_info(${table})`).all().map(row=>String(row.name));
   counts[table]=0;
   for(const row of source.prepare(`SELECT * FROM ${table} ORDER BY rowid`).iterate()){
    const values=columns.map(column=>row[column]);
    await client.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map((_,i)=>'$'+(i+1)).join(',')})`,values);
    counts[table]++;
   }
   const target=await client.query(`SELECT count(*)::integer n FROM ${table}`);
   if(target.rows[0].n!==counts[table])throw new Error(`Count mismatch for ${table}`);
  }
  await client.query("SELECT setval(pg_get_serial_sequence('events','seq'),COALESCE(max(seq),1),max(seq) IS NOT NULL) FROM events");
  console.log(JSON.stringify({imported:counts,excluded:['sessions: require new login','patent_analysis: derived projection']},null,2));
 });
}finally{source.close();await pool.end();}
