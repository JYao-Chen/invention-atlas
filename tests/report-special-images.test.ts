import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {reportSpecialImages} from '../src/server/report-special-images';
import type {AnalysisResult} from '../src/lib/types';
const fixture:AnalysisResult={id:'fixture',tool:'generate_wordcloud',title:'合成验收',datasetId:'fixture',status:'completed',params:{},summary:'测试',warnings:[],method:'合成',evidence:[],createdAt:'2026-10-12',rows:[]};
test('Word clouds preserve yearly grouping and cover more than sixty words without a hidden cap',async()=>{
 const rows=Array.from({length:65},(_,i)=>({year:2020,word:'word-'+i,tfidf:i+1}));rows.push({year:2021,word:'different-year',tfidf:10});
 const images=await reportSpecialImages({...fixture,rows});assert.equal(images.length,3);assert.match(images[1].caption,/61—65项，共65词/);assert.match(images[2].caption,/2021/);
 assert.match(images[0].caption,/绘出60词/);assert.match(images[1].caption,/绘出5词/);assert.match(images[2].caption,/绘出1词/);
 for(const image of images){assert.equal((await sharp(image.data).metadata()).format,'png');assert.ok(image.caption.includes('绘出'));}
});
test('Word clustering uses saved coordinates and documents all points and variance',async()=>{
 const images=await reportSpecialImages({...fixture,clusterMap:{points:[{patent:'A',title:'A',cluster:1,x:-1,y:2},{patent:'B',title:'B',cluster:2,x:2,y:-1}],variance:[.4,.3]}});
 assert.equal(images.length,1);assert.match(images[0].caption,/全部2项/);assert.match(images[0].caption,/70.0%/);assert.equal((await sharp(images[0].data).metadata()).width,1000);
});
test('Word network includes isolated nodes and records endpoint omissions',async()=>{
 const images=await reportSpecialImages({...fixture,graph:{nodes:[{id:'a',label:'A',kind:'patent',value:1},{id:'b',label:'B',kind:'external',value:1},{id:'isolated',label:'孤立',kind:'patent',value:0}],edges:[{source:'a',target:'b',weight:2,kind:'citation'},{source:'a',target:'missing',weight:1}]}});
 assert.equal(images.length,1);assert.match(images[0].caption,/全部3个节点（含孤立节点）/);assert.match(images[0].caption,/绘出1\/2条边/);assert.equal((await sharp(images[0].data).metadata()).format,'png');
});
