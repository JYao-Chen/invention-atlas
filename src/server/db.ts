import './config';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {Dataset,Patent,AnalysisPatent,Run,Conversation,AnalysisResult} from '@/lib/types';

export const dataRoot=resolve(process.env.PATENT_DATA_DIR||'data');
mkdirSync(dataRoot,{recursive:true});
const globalDb=globalThis as unknown as {patentDb?:DatabaseSync};
export const db=globalDb.patentDb||new DatabaseSync(resolve(dataRoot,'patents.sqlite'));
globalDb.patentDb=db;
function projection(payload:string){return `json_set(json_remove(${payload},'$.rawText','$.description','$.locations'),'$.rawText','','$.description','','$.locations',json('{}'),'$.deferredText',json_object('descriptionChars',length(json_extract(${payload},'$.description'))))`;}
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
CREATE TABLE IF NOT EXISTS patent_analysis(dataset_id TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(dataset_id,id));
CREATE TRIGGER IF NOT EXISTS patent_analysis_insert AFTER INSERT ON patents BEGIN
 INSERT OR REPLACE INTO patent_analysis VALUES(NEW.dataset_id,NEW.id,${projection('NEW.payload')}); END;
CREATE TRIGGER IF NOT EXISTS patent_analysis_update AFTER UPDATE ON patents BEGIN
 DELETE FROM patent_analysis WHERE dataset_id=OLD.dataset_id AND id=OLD.id;
 INSERT OR REPLACE INTO patent_analysis VALUES(NEW.dataset_id,NEW.id,${projection('NEW.payload')}); END;
CREATE TRIGGER IF NOT EXISTS patent_analysis_delete AFTER DELETE ON patents BEGIN
 DELETE FROM patent_analysis WHERE dataset_id=OLD.dataset_id AND id=OLD.id; END;
`);
export function setting(key:string,value?:string){if(value!==undefined)db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run(key,value);return (db.prepare('SELECT value FROM settings WHERE key=?').get(key) as {value:string}|undefined)?.value;}
export function datasets():Dataset[]{return (db.prepare('SELECT payload FROM datasets ORDER BY rowid DESC').all() as {payload:string}[]).map(r=>JSON.parse(r.payload));}
export function dataset(id?:string):Dataset|undefined{return datasets().find(d=>d.id===(id||setting('active_dataset')))||(!id?datasets()[0]:undefined);}
export function patents(id:string):Patent[]{const records:Patent[]=[];for(const row of db.prepare('SELECT payload FROM patents WHERE dataset_id=? ORDER BY id').iterate(id))records.push(JSON.parse(row.payload as string));return records;}
export function patent(datasetId:string,id:string):Patent|undefined{const row=db.prepare('SELECT payload FROM patents WHERE dataset_id=? AND id=?').get(datasetId,id);return row?JSON.parse(row.payload as string):undefined;}
export function analysisPatents(id:string):AnalysisPatent[]{
 const records:AnalysisPatent[]=[];
 ensureAnalysis(id);
 const query=db.prepare('SELECT payload FROM patent_analysis WHERE dataset_id=? ORDER BY id');
 for(const row of query.iterate(id))records.push(JSON.parse(row.payload as string));
 return records;
}
function ensureAnalysis(id:string){
 // Existing datasets are projected once. Triggers keep later imports, edits and vector writes in sync.
 db.prepare(`INSERT OR IGNORE INTO patent_analysis SELECT dataset_id,id,${projection('payload')} FROM patents p WHERE dataset_id=? AND NOT EXISTS(SELECT 1 FROM patent_analysis a WHERE a.dataset_id=p.dataset_id AND a.id=p.id)`).run(id);
}
export function fullPatent(datasetId:string,p:AnalysisPatent):Patent{if(!p.deferredText)return p;const original=patent(datasetId,p.id);if(!original)throw new Error('原始专利记录不存在：'+p.id);return {...original,applicants:p.applicants};}
export function descriptionChars(p:AnalysisPatent){return p.deferredText?.descriptionChars??p.description.length;}
export function hasField(p:AnalysisPatent,key:string){if(key==='description')return descriptionChars(p)>0;const value=p[key as keyof Patent];return Array.isArray(value)?value.length>0:Boolean(value);}
export function patentPage(datasetId:string,query:string,page:number){
 ensureAnalysis(datasetId);
 const where="dataset_id=? AND (?='' OR instr(lower(id||' '||json_extract(payload,'$.title')||' '||coalesce((SELECT group_concat(value,' ') FROM json_each(payload,'$.applicants')),'')),?)>0)";
 const args=[datasetId,query.toLowerCase(),query.toLowerCase()];
 const total=Number(db.prepare('SELECT COUNT(*) n FROM patent_analysis WHERE '+where).get(...args)!.n);
 const rows=db.prepare(`SELECT json_set(json_remove(payload,'$.embedding','$.rawText','$.description','$.claims','$.deferredText'),'$.claimCount',json_array_length(json_extract(payload,'$.claims')),'$.descriptionChars',json_extract(payload,'$.deferredText.descriptionChars')) payload FROM patent_analysis WHERE ${where} ORDER BY id LIMIT 20 OFFSET ?`).all(...args,(page-1)*20);
 return {total,page,records:rows.map(row=>JSON.parse(row.payload as string))};
}
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
