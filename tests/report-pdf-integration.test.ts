import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {exportReportPdf} from '../src/server/report-pdf';
import type {Run,AnalysisResult} from '../src/lib/types';

test('real simultaneous PDF conversions keep snapshot contents separate and retain every row',{
 skip:!process.env.PATENT_PDF_LIBREOFFICE_DIR||!process.env.PATENT_PDF_REGISTRY_DIR?'配置完整PDF运行环境后执行此集成测试':false,
},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'atlas-pdf-integration-'));
 try{
  await Promise.all(['ALPHA','BETA'].map(async(marker,index)=>{
   const result:AnalysisResult={id:'fixture',tool:'audit_dataset',datasetId:'TEST ONLY',title:'结果'+marker,status:'completed',params:{},summary:'合成验收',warnings:[],evidence:[],method:'合成',createdAt:'2026-10-12',rows:Array.from({length:80},(_,i)=>({patent:marker+'RECORD'+String(i).padStart(3,'0'),count:index*1000+i}))};
   const run={datasetId:'TEST ONLY',createdAt:'2026-10-12',answer:'# '+marker+'\n\n$\\frac{N+1}{DF+1}$\n\n[[chart:fixture]]',results:[result]} as Run;
   const pdf=await exportReportPdf({title:marker+' REPORT',run,revision:index+1});
   assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
   const file=join(dir,marker+'.pdf');await writeFile(file,pdf,{mode:0o600});
   const text=(await promisify(execFile)('pdftotext',['-layout',file,'-'])).stdout;
   assert.ok(text.includes(marker+' REPORT'));assert.ok(!text.includes(marker==='ALPHA'?'BETARECORD':'ALPHARECORD'));
   assert.match(text,/PDF\s*版保留正文/);assert.ok(!text.includes('Word 版'));
   for(let i=0;i<80;i++)assert.ok(text.includes(marker+'RECORD'+String(i).padStart(3,'0')),'missing '+marker+' row '+i);
  }));
 }finally{await rm(dir,{recursive:true,force:true});}
});
