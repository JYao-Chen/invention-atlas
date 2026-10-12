import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalize} from '../src/server/importers';
import {chunkPatent} from '../src/server/patent-chunks';

test('chunks preserve exact source slices, full coverage and claim dependencies',()=>{
 const patent=normalize({id:'US123B1',abstract:'中文与 English abstract.',description:Array(30).fill('A paragraph describes network authentication.\n').join('')},'TEST');
 patent.claims=[{number:1,text:'An independent claim. '.repeat(8)},{number:2,text:'The method of claim 1.',dependsOn:[1]}];
 const chunks=chunkPatent(patent,'source-version-1',{maxChars:200,overlapChars:20,maxClaimChars:500});
 assert.equal(chunks.filter(c=>c.claimNumber===1).length,1);
 assert.deepEqual(chunks.find(c=>c.claimNumber===2)?.dependsOn,[1]);
 for(const chunk of chunks){const text=chunk.section==='claim'?patent.claims.find(c=>c.number===chunk.claimNumber)!.text:patent[chunk.section];assert.equal(text.slice(chunk.start,chunk.end),chunk.text);assert.equal(chunk.documentVersion,'source-version-1');}
 const description=chunks.filter(c=>c.section==='description');
 assert.equal(description[0].start,0);assert.equal(description.at(-1)!.end,patent.description.length);
 for(let i=1;i<description.length;i++)assert.ok(description[i].start<=description[i-1].end);
});

test('raw offsets only appear when field locations match the exact original text',()=>{
 const patent=normalize({id:'US124B1',abstract:'Exact text'},'TEST');
 patent.rawText='prefix Exact text suffix';patent.locations.abstract={start:7,end:17};
 let chunk=chunkPatent(patent,'v1')[0];assert.equal(patent.rawText.slice(chunk.rawStart,chunk.rawEnd),chunk.text);
 patent.locations.abstract={start:0,end:10};chunk=chunkPatent(patent,'v1')[0];assert.equal(chunk.rawStart,undefined);
 assert.throws(()=>chunkPatent(patent,''),/原文版本/);
 assert.throws(()=>chunkPatent(patent,'v1',{maxChars:200,overlapChars:100}),/范围无效/);
});
