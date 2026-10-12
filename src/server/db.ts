import './config';
import {resolve} from 'node:path';
import {mkdirSync} from 'node:fs';
import type {AnalysisPatent,Patent} from '@/lib/types';
import {postgresPool} from './postgres';
import {PostgresStore} from './postgres-store';

export const dataRoot=resolve(process.env.PATENT_DATA_DIR||'data');
mkdirSync(dataRoot,{recursive:true});
const globalDb=globalThis as unknown as {patentPool?:ReturnType<typeof postgresPool>};
export const db=globalDb.patentPool||postgresPool();
globalDb.patentPool=db;
export const store=new PostgresStore(db);
export const setting=store.setting.bind(store);
export const datasets=store.datasets.bind(store);
export const dataset=store.dataset.bind(store);
export const patents=store.patents.bind(store);
export const patent=store.patent.bind(store);
export const analysisPatents=store.analysisPatents.bind(store);
export const fullPatent=store.fullPatent.bind(store);
export const patentPage=store.patentPage.bind(store);
export const saveDataset=store.saveDataset.bind(store);
export const updateDataset=store.updateDataset.bind(store);
export const savePatent=store.savePatent.bind(store);
export const conversations=store.conversations.bind(store);
export const newConversation=store.newConversation.bind(store);
export const runs=store.runs.bind(store);
export const run=store.run.bind(store);
export const saveRun=store.saveRun.bind(store);
export const finishRun=store.finishRun.bind(store);
export const event=store.event.bind(store);
export const events=store.events.bind(store);
export const saveResult=store.saveResult.bind(store);
export const savedResult=store.savedResult.bind(store);
export const savedResults=store.savedResults.bind(store);
export const reports=store.reports.bind(store);
export const saveReport=store.saveReport.bind(store);
export function descriptionChars(p:AnalysisPatent){return p.deferredText?.descriptionChars??p.description.length;}
export function hasField(p:AnalysisPatent,key:string){if(key==='description')return descriptionChars(p)>0;const value=p[key as keyof Patent];return Array.isArray(value)?value.length>0:Boolean(value);}
