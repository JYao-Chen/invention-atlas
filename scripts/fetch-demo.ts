import {mkdirSync,existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {dltPatent,datasetMeta} from '../src/server/importers';
import {saveDataset,datasets,dataRoot} from '../src/server/db';
import type {Patent} from '../src/lib/types';
const root=resolve(dataRoot,'sources/dlt');mkdirSync(root,{recursive:true});
if(datasets().some(d=>d.source.includes('DLT-Patents'))){console.log('真实样本数据已导入，未重复创建');process.exit(0);}
const meta=await (await fetch('https://huggingface.co/api/datasets/ExponentialScience/DLT-Patents')).json();
const source='https://huggingface.co/datasets/ExponentialScience/DLT-Patents';
const selected:Patent[]=[];const ids=new Set<string>();const fetched:{offset:number;url:string;count:number}[]=[];
const total=49025;
for(const offset of [0,Math.floor(total/5),Math.floor(total*2/5),Math.floor(total*3/5),Math.floor(total*4/5),total-100]){
 const file=resolve(root,`rows-${offset}.json`);const url=`https://datasets-server.huggingface.co/rows?dataset=ExponentialScience%2FDLT-Patents&config=default&split=train&offset=${offset}&length=100`;
 let batch;if(existsSync(file))batch=JSON.parse(readFileSync(file,'utf8'));else{const response=await fetch(url,{signal:AbortSignal.timeout(90000)});if(!response.ok)throw new Error(`真实数据下载失败 ${response.status}`);batch=await response.json();writeFileSync(file,JSON.stringify(batch));}
 fetched.push({offset,url,count:batch.rows?.length||0});let usable=0;
 for(const item of batch.rows||[]){if(item.truncated_cells?.length)continue;const p=dltPatent(item.row);if(ids.has(p.id)||!p.title||!p.abstract||!p.applicants.length||!p.publicationDate||!p.claims.length||!p.description)continue;ids.add(p.id);selected.push(p);usable++;}
 console.log(`源位置 ${offset}：${usable} 条具有完整文本的真实记录；候选累计 ${selected.length}`);
}
if(selected.length<300)throw new Error(`仅 ${selected.length} 条满足字段要求；未用合成记录补足`);
// Evenly select along fetched windows; no quotas are imposed on publication years.
const records=Array.from({length:300},(_,i)=>selected[Math.floor(i*selected.length/300)]);
const sampling='从49,025条公开语料的6个分散位置各读取100条候选，排除截断、重复及必要字段缺失记录，再按候选次序等距选取300条。不是随机总体样本，也没有年度数量配额。';
const dataset=datasetMeta('专利样本库 · 原始版本',records,source,sampling);
writeFileSync(resolve(root,'acquisition.json'),JSON.stringify({source,revision:meta.sha,retrievedAt:new Date().toISOString(),sampling,fetched,selected:records.map(p=>p.id),licenseNote:'Dataset publisher describes USPTO patent text as Public Domain; retain source attribution. No rights to practice patented inventions.'},null,2));
writeFileSync(resolve(root,'patents.jsonl'),records.map(p=>JSON.stringify(p)).join('\n'));
saveDataset(dataset,records);console.log(JSON.stringify(dataset,null,2));
