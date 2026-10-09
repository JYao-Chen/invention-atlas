import {mkdirSync,existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {dataset,datasets,patents,saveDataset,savePatent,updateDataset,setting,dataRoot} from '../src/server/db';
import {datasetMeta} from '../src/server/importers';
import {enrichPatent} from '../src/server/public-enrichment';
const root=resolve(dataRoot,'sources/public-enrichment');mkdirSync(root,{recursive:true});
const name='专利样本库';
const existing=datasets().find(d=>d.name===name);if(existing&&patents(existing.id).filter(p=>p.publicEvidence?.familyRegions).length===10){setting('active_dataset',existing.id);console.log('已存在补充数据版本，切换到该版本，未重复采集。');process.exit(0);}
const original=datasets().find(d=>d.source.includes('DLT-Patents')&&d.id!==existing?.id)||existing;if(!original)throw new Error('请先执行 npm run data:fetch 获取真实样本');
const ids=['US9646029B1','US9703986B1','US10002362B1','US9679276B1','US11756515B1','US8882509B1','US20180254093A1','US11755563B2','US11753618B2','US20180254898A1'],records=patents(original.id),snapshots=[];
for(const id of ids){const index=records.findIndex(p=>p.id===id);if(index<0)throw new Error('公开编号不在原数据中');const file=resolve(root,id+'.json');let cached:{retrievedAt:string;html:string};
 if(existsSync(file))cached=JSON.parse(readFileSync(file,'utf8'));else{const response=await fetch(`https://patents.google.com/patent/${id}/en`,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error(`${id}：页面下载HTTP ${response.status}`);cached={retrievedAt:new Date().toISOString(),html:await response.text()};writeFileSync(file,JSON.stringify(cached));}
 records[index]=enrichPatent(records[index],cached.html,cached.retrievedAt);snapshots.push({id,...records[index].publicEvidence,status:records[index].legalStatus});console.log(JSON.stringify({id,status:records[index].legalStatus,familyApplications:records[index].familyMembers.length,events:records[index].publicEvidence!.legalEvents.length}));
}
const meta=datasetMeta(name,records,original.source,original.sampling+' 在原样本中目的选取10条不同公开年代、公开类型及主题的代表记录，补充无需登录的Google Patents页面快照；不随机、不代表全部300条均已补齐。');
meta.warnings.push('仅10/300条请求了第三方页面补充，不是官方有效性确认；获取日期不是事件发生日期。','同族仅为Family Applications及Country Status的代表公开件，不是完整全球同族；缺失不代表没有同族。','转让/权属记录没有交易金额；不据此计算商业估值。','源DLT语料包含跨领域记录，不保证每条都与区块链核心技术相关；领域分析应先检索筛选。');
if(existing){meta.id=existing.id;meta.createdAt=existing.createdAt;for(const p of records.filter(p=>p.publicEvidence))savePatent(meta.id,p);updateDataset(meta);setting('active_dataset',meta.id);}else saveDataset(meta,records);
writeFileSync(resolve(root,'manifest.json'),JSON.stringify({datasetId:meta.id,baseDatasetId:original.id,selected:ids,snapshots,limitations:meta.warnings,rightsNote:'Local factual supplementation from publicly accessible patent pages, not an openly licensed redistribution of Google HTML or an official legal-status dataset.'},null,2));console.log('已保存新数据版本 '+meta.id+'，原始文本、向量及旧报告未改写。');
