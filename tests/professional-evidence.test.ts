import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {AnalysisResult} from '../src/lib/types';
import {representativeSelection} from '../src/server/professional-evidence';

test('representatives come from row associations, stay in scope and include several tools before capping',()=>{
 const result=(tool:string,ids:string[])=>({tool,evidence:['arbitrary'],rowSources:ids.map((id,row)=>({row,patentIds:[id],representatives:[{patent:id,title:id,sourceUrl:''}]}))}) as AnalysisResult;
 const picked=representativeSelection([result('first',['A','B','C','outside']),result('second',['D','E'])],['A','B','C','D','E'],3);
 assert.deepEqual(picked.patentIds,['A','D','B']);assert.equal(picked.linkedRepresentatives,5);assert.equal(picked.omittedRepresentatives,2);
 assert.deepEqual(representativeSelection([result('none',[])],['arbitrary']).patentIds,[]);
});
