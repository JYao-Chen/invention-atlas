import './config';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {Dataset,Patent,Run,Conversation,AnalysisResult} from '@/lib/types';

export const dataRoot=resolve(process.env.PATENT_DATA_DIR||'data');
mkdirSync(dataRoot,{recursive:true});
const globalDb=globalThis as unknown as {patentDb?:DatabaseSync};
export const db=globalDb.patentDb||new DatabaseSync(resolve(dataRoot,'patents.sqlite'));
globalDb.patentDb=db;
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS datasets(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS patents(dataset_id TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(dataset_id,id));
CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,dataset_id TEXT NOT NULL,title TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,run_id TEXT NOT NULL,event TEXT NOT NULL,payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,title TEXT NOT NULL,run_id TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS monitors(key TEXT PRIMARY KEY,payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS results(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
`);
export function setting(key:string,value?:string){if(value!==undefined)db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run(key,value);return (db.prepare('SELECT value FROM settings WHERE key=?').get(key) as {value:string}|undefined)?.value;}
export function datasets():Dataset[]{return (db.prepare('SELECT payload FROM datasets ORDER BY rowid DESC').all() as {payload:string}[]).map(r=>JSON.parse(r.payload));}
export function dataset(id?:string):Dataset|undefined{return datasets().find(d=>d.id===(id||setting('active_dataset')))||(!id?datasets()[0]:undefined);}
export function patents(id:string):Patent[]{return (db.prepare('SELECT payload FROM patents WHERE dataset_id=? ORDER BY id').all(id) as {payload:string}[]).map(r=>JSON.parse(r.payload));}
export function saveDataset(meta:Dataset,records:Patent[]){db.exec('BEGIN');try{db.prepare('INSERT INTO datasets VALUES(?,?)').run(meta.id,JSON.stringify(meta));const q=db.prepare('INSERT INTO patents VALUES(?,?,?)');for(const p of records)q.run(meta.id,p.id,JSON.stringify(p));setting('active_dataset',meta.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}
export function updateDataset(meta:Dataset){db.prepare('UPDATE datasets SET payload=? WHERE id=?').run(JSON.stringify(meta),meta.id);}
export function savePatent(datasetId:string,p:Patent){db.prepare('UPDATE patents SET payload=? WHERE dataset_id=? AND id=?').run(JSON.stringify(p),datasetId,p.id);}
export function conversations():Conversation[]{return (db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC').all() as {id:string;dataset_id:string;title:string;updated_at:string}[]).map(r=>({id:r.id,datasetId:r.dataset_id,title:r.title,updatedAt:r.updated_at}));}
export function newConversation(datasetId:string,title='新对话'){const c:Conversation={id:randomUUID(),datasetId,title,updatedAt:new Date().toISOString()};db.prepare('INSERT INTO conversations VALUES(?,?,?,?)').run(c.id,c.datasetId,c.title,c.updatedAt);return c;}
export function runs(conversationId?:string):Run[]{const q=conversationId?db.prepare('SELECT payload FROM runs WHERE conversation_id=? ORDER BY rowid'):db.prepare('SELECT payload FROM runs ORDER BY rowid DESC');return (conversationId?q.all(conversationId):q.all() as unknown[]).map(r=>JSON.parse((r as {payload:string}).payload));}
export function run(id:string):Run|undefined{const r=db.prepare('SELECT payload FROM runs WHERE id=?').get(id) as {payload:string}|undefined;return r?JSON.parse(r.payload):undefined;}
export function saveRun(r:Run){db.prepare('INSERT OR REPLACE INTO runs VALUES(?,?,?)').run(r.id,r.conversationId,JSON.stringify(r));db.prepare('UPDATE conversations SET updated_at=? WHERE id=?').run(new Date().toISOString(),r.conversationId);}
export function event(id:string,name:string,payload:unknown){db.prepare('INSERT INTO events(run_id,event,payload) VALUES(?,?,?)').run(id,name,JSON.stringify(payload));}
export function events(id:string,after=0){return db.prepare('SELECT seq,event,payload FROM events WHERE run_id=? AND seq>? ORDER BY seq').all(id,after) as {seq:number;event:string;payload:string}[];}
export function saveResult(r:AnalysisResult){db.prepare('INSERT OR REPLACE INTO results VALUES(?,?)').run(r.id,JSON.stringify(r));}
export function savedResults(datasetId:string):AnalysisResult[]{return (db.prepare('SELECT payload FROM results ORDER BY rowid DESC').all() as {payload:string}[]).map(row=>JSON.parse(row.payload) as AnalysisResult).filter(result=>result.datasetId===datasetId).slice(0,24);}
export function reports():{id:string;title:string;createdAt:string;run:Run}[]{return (db.prepare('SELECT * FROM reports ORDER BY created_at DESC').all() as {id:string;title:string;payload:string;created_at:string}[]).map(r=>({id:r.id,title:r.title,createdAt:r.created_at,...JSON.parse(r.payload)}));}
export function saveReport(r:Run,title:string){const id=randomUUID();db.prepare('INSERT INTO reports VALUES(?,?,?,?,?)').run(id,title,r.id,JSON.stringify({run:r}),new Date().toISOString());return id;}
