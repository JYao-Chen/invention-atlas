import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalize,datasetMeta} from '../src/server/importers';
import {executeTool} from '../src/server/tools';
import {store} from '../src/server/db';
test('Boolean tool reports full hit count, applies Top-K afterwards and reads deferred description',async()=>{
 const records=[normalize({id:'US1B1',title:'Temperature sensor',abstract:'Feedback',description:'A cooling valve',publication_date:'2023-01-01'},'TEST'),normalize({id:'US2B1',title:'Temperature sensor',abstract:'Feedback',description:'No valve here',publication_date:'2024-01-01'},'TEST')];
 const meta=datasetMeta('Boolean fixture',records,'fixture','fixture');await store.saveDataset(meta,records);
 const result=await executeTool('search_patents',{query:'title:temperature AND abstract:feedback',top_k:1},meta,records,{semantic:true});
 assert.match(result.summary,/命中 2 条，返回 1 条/);assert.equal(result.rows[0].patent,'US2B1');assert.equal(result.rows[0].score,1);
 const fulltext=await executeTool('search_patents',{query:'description:"cooling valve"'},meta,await store.analysisPatents(meta.id),{semantic:true});
 assert.deepEqual(fulltext.rows.map(row=>row.patent),['US1B1']);
});
