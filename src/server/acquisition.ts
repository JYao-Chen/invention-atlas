import {z} from 'zod';
import {mkdirSync,existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {dataRoot,saveDataset} from './db';
import {dltPatent,datasetMeta} from './importers';
import {lexical} from './algorithms';
import type {Patent} from '@/lib/types';
export const acquisitionSchema=z.object({name:z.string().trim().min(1).max(100),offset:z.number().int().min(0).max(49024),batches:z.number().int().min(1).max(10),query:z.string().max(2000).default('')});
export async function acquireDlt(input:z.infer<typeof acquisitionSchema>,signal:AbortSignal,progress:(data:unknown)=>void){
 const root=resolve(dataRoot,'sources/dlt-online');mkdirSync(root,{recursive:true});const candidates:Patent[]=[],windows:{offset:number;retrievedAt:string;url:string}[]=[];
 for(let batch=0;batch<input.batches;batch++){signal.throwIfAborted();const offset=input.offset+batch*100;if(offset>=49025)break;const url=`https://datasets-server.huggingface.co/rows?dataset=ExponentialScience%2FDLT-Patents&config=default&split=train&offset=${offset}&length=100`,file=resolve(root,'rows-'+offset+'.json');let page:{retrievedAt:string;rows:{row:Record<string,unknown>;truncated_cells?:string[]}[]};
  if(existsSync(file))page=JSON.parse(readFileSync(file,'utf8'));else{const response=await fetch(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(90000)])});if(!response.ok)throw new Error('公开语料读取失败：HTTP '+response.status);const data=await response.json();if(!Array.isArray(data.rows))throw new Error('来源未返回记录数组');page={retrievedAt:new Date().toISOString(),rows:data.rows};writeFileSync(file,JSON.stringify(page));}
  for(const row of page.rows){if(row.truncated_cells?.length)continue;const patent=dltPatent(row.row);if(patent.id&&patent.title&&patent.abstract&&patent.claims.length&&patent.description)candidates.push(patent);}windows.push({offset,retrievedAt:page.retrievedAt,url});progress({done:batch+1,total:input.batches,candidates:candidates.length});
 }
 const unique=[...new Map(candidates.map(p=>[p.id,p])).values()],records=input.query.trim()?lexical(unique,input.query).map(r=>r.p):unique;
 if(!records.length)throw new Error('所选位置没有符合字段与检索条件的记录；已下载窗口保留，可更换位置或英文检索词');
 const meta=datasetMeta(input.name,records,'https://huggingface.co/datasets/ExponentialScience/DLT-Patents',`按用户指定源位置${windows.map(w=>w.offset).join('、')}各读取最多100条；排除截断、缺全文和重复公开编号。${input.query?'BM25筛选标题与摘要：'+input.query+'。':''}不是随机样本、全行业检索或全球实时专利库。`);saveDataset(meta,records);writeFileSync(resolve(root,meta.id+'-acquisition.json'),JSON.stringify({datasetId:meta.id,windows,selected:records.map(p=>p.id),query:input.query},null,2));return meta;
}
