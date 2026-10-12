import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {reportChartImages} from '../src/server/report-chart-image';
import type {AnalysisResult} from '../src/lib/types';
test('Word chart images cover every bar in pages and preserve the shared metric',async()=>{
 const result:AnalysisResult={id:'fixture',datasetId:'fixture',tool:'generate_wordcloud',title:'合成图表',status:'completed',params:{},summary:'格式验收',method:'合成数据',warnings:[],evidence:[],createdAt:'2026-10-12',chart:{kind:'bar',x:'word',y:'count'},rows:Array.from({length:45},(_,i)=>({word:'term-'+i,count:i-5}))};
 const images=await reportChartImages(result);assert.equal(images.length,3);assert.match(images[2].caption,/41—45项，共45项/);
 for(const image of images){const meta=await sharp(image.data).metadata();assert.equal(meta.format,'png');assert.equal(meta.width,1000);assert.ok(meta.height!>=300);}
 assert.equal((await reportChartImages({...result,chart:{kind:'line',x:'word',y:'count'}})).length,1);
 assert.deepEqual(await reportChartImages({...result,chart:undefined}),[]);
});
test('a single line observation remains visible as a plotted point',async()=>{
 const result:AnalysisResult={id:'single',datasetId:'fixture',tool:'analyze_trends',title:'单点',status:'completed',params:{},summary:'格式验收',method:'合成数据',warnings:[],evidence:[],createdAt:'2026-10-12',chart:{kind:'line',x:'year',y:'count'},rows:[{year:2025,count:4}]};
 const [image]=await reportChartImages(result);
 const {data,info}=await sharp(image.data).removeAlpha().raw().toBuffer({resolveWithObject:true});
 // The point is at the left edge and top of the plotting area. Text and grid
 // cannot supply the saturated blue pixel at its centre.
 const offset=(45*info.width+80)*info.channels;
 assert.ok(data[offset+2]>data[offset]+30);
});
