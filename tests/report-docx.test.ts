import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {exportReportDocx} from '../src/server/report-docx';
import type {Run,AnalysisResult} from '../src/lib/types';
test('Word export retains headings, links, lists and every result row in narrative order',async()=>{
 const result:AnalysisResult={id:'chart-fixture',datasetId:'fixture',params:{},warnings:[],method:'合成验收',evidence:[],createdAt:'2026-10-12T00:00:00Z',title:'完整年度结果',tool:'analyze_yearly_keywords',rows:Array.from({length:80},(_,i)=>({year:2018+Math.floor(i/10),word:'term-'+i,count:i})),summary:'80行结果',status:'completed'};
 const run={datasetId:'fixture',createdAt:'2026-10-12T00:00:00Z',answer:'# 研究结果\n\n**正文**与[来源](https://example.org/patent)。\n\n- 第一项\n- 第二项\n\n[[chart:chart-fixture]]\n\n## 结论\n\n末尾。',results:[result]} as Run;
 const dir=await mkdtemp(join(tmpdir(),'atlas-docx-'));
 result.chart={kind:'bar',x:'word',y:'count'};
 run.answer+='\n\n$'+String.fromCharCode(92)+'frac{N+1}{DF+1}+x_i^2+'+String.fromCharCode(92)+'sqrt{y}$';
 try{
  const file=join(dir,'report.docx');await writeFile(file,await exportReportDocx({title:'专利分析验收',run,revision:2}));
  const xml=(await promisify(execFile)('unzip',['-p',file,'word/document.xml'],{maxBuffer:2*1024*1024})).stdout;
  assert.ok(xml.includes('专利分析验收'));assert.ok(xml.includes('人工编辑草稿第2版'));assert.match(xml,/w:pStyle w:val="Heading1"/);assert.match(xml,/w:numPr/);
  for(let i=0;i<80;i++)assert.ok(xml.includes('term-'+i+'</w:t>'),'missing row '+i);
  assert.ok(xml.indexOf('完整年度结果')<xml.indexOf('结论'));assert.ok(xml.includes('w:tblHeader'));
  assert.ok(xml.includes('<m:oMath>'));assert.ok(xml.includes('<m:f>'));assert.ok(xml.includes('<m:sSubSup>'));assert.ok(xml.includes('<m:rad>'));assert.ok(!xml.includes('未转换公式，LaTeX原式'));
  assert.ok(xml.includes('静态条形图'));assert.ok(xml.includes('61—80项，共80项'));
  const members=(await promisify(execFile)('unzip',['-Z1',file])).stdout;assert.equal(members.split('\n').filter(name=>name.startsWith('word/media/')&&name.endsWith('.png')).length,4);
  const links=(await promisify(execFile)('unzip',['-p',file,'word/_rels/document.xml.rels'])).stdout;assert.ok(links.includes('https://example.org/patent'));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('wide result tables split fields without dropping data or multiline evidence',async()=>{
 const result:AnalysisResult={id:'wide',datasetId:'fixture',params:{},warnings:[],method:'合成验收',evidence:[],createdAt:'2026-10-12',title:'宽表',tool:'audit_dataset',summary:'合成',status:'completed',rows:[{patent:'TEST-ID',...Object.fromEntries(Array.from({length:12},(_,i)=>['field'+i,'unique-value-'+i])),quote:'第一段\n第二段'}]};
 const dir=await mkdtemp(join(tmpdir(),'atlas-docx-wide-'));
 try{
  const file=join(dir,'wide.docx');await writeFile(file,await exportReportDocx({title:'宽表合成',run:{datasetId:'fixture',createdAt:'2026-10-12',answer:'',results:[result]} as Run}));
  const xml=(await promisify(execFile)('unzip',['-p',file,'word/document.xml'])).stdout;
  assert.equal((xml.match(/字段分表/g)||[]).length,3);assert.equal((xml.match(/TEST-ID<\/w:t>/g)||[]).length,3);
  for(let i=0;i<12;i++)assert.ok(xml.includes('unique-value-'+i+'</w:t>'));
  assert.ok(xml.includes('第一段</w:t>'));assert.ok(xml.includes('第二段</w:t>'));assert.ok(xml.includes('w:tblLayout w:type="fixed"'));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('Word clustering retains the complete saved coordinate table',async()=>{
 const result:AnalysisResult={id:'cluster',datasetId:'fixture',params:{},warnings:[],method:'合成验收',evidence:[],createdAt:'2026-10-12',title:'聚类结果',tool:'cluster_topics',rows:[],summary:'坐标验收',status:'completed',clusterMap:{points:Array.from({length:45},(_,i)=>({patent:'fixture-patent-'+i,title:'合成标题'+i,cluster:i%3+1,x:i+.125,y:-i-.25})),variance:[.4,.3]}};
 const run={datasetId:'fixture',createdAt:'2026-10-12',answer:'[[chart:cluster]]',results:[result]} as Run;
 const dir=await mkdtemp(join(tmpdir(),'atlas-docx-cluster-'));
 try{
  const file=join(dir,'report.docx');await writeFile(file,await exportReportDocx({title:'合成聚类验收',run}));
  const xml=(await promisify(execFile)('unzip',['-p',file,'word/document.xml'],{maxBuffer:2*1024*1024})).stdout;
  assert.ok(xml.includes('聚类坐标明细'));assert.ok(xml.includes('PC1'));assert.ok(xml.includes('PC2'));
  for(let i=0;i<45;i++){assert.ok(xml.includes('fixture-patent-'+i+'</w:t>'));assert.ok(xml.includes(String(i+.125)+'</w:t>'));}
 }finally{await rm(dir,{recursive:true,force:true});}
});
