import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Patent} from '../src/lib/types';
import {entityCandidates,entityMapping} from '../src/server/professional-entities';

test('similar names remain suggestions and only exact normalized names become initial aliases',()=>{
 const records=[{applicants:['Example','Example Labs']},{applicants:['Example Labs']} ] as Patent[];
 const groups=entityCandidates(records,[' example ','Labs','Missing']);
 assert.deepEqual(groups[0].aliases,['Example']);assert.equal(groups[0].suggestions[0].records,2);
 assert.deepEqual(groups[1].aliases,[]);assert.equal(groups[1].suggestions[0].name,'Example Labs');
 assert.deepEqual(groups[2].suggestions,[]);
});
test('a source name cannot be assigned to two competing entities',()=>{
 assert.equal(entityMapping.safeParse([{entity:'A',aliases:['Example']},{entity:'B',aliases:['example']}]).success,false);
 assert.equal(entityMapping.safeParse([{entity:'A',aliases:['Example']},{entity:'B',aliases:[]}]).success,true);
});
