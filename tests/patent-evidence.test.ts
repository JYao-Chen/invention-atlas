import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalize} from '../src/server/importers';
import {resolvePatentEvidence} from '../src/lib/patent-evidence';
test('evidence locations require exact source text rather than guessing another occurrence',()=>{
 const patent=normalize({id:'TEST',abstract:'First quote then quote.',claims:[{number:1,text:'**1**. A sensor.\n**2**. A valve.'}]},'TEST');
 assert.equal(resolvePatentEvidence(patent,{section:'abstract',start:6,quote:'quote'})?.start,6);
 assert.equal(resolvePatentEvidence(patent,{section:'abstract',start:0,quote:'quote'}),undefined);
 const text=patent.claims[0].text,start=text.indexOf('A valve');assert.equal(resolvePatentEvidence(patent,{section:'claim',claim:1,start,quote:'A valve'})?.text,text);
 assert.equal(resolvePatentEvidence(patent,{section:'claim',claim:2,start,quote:'A valve'}),undefined);
});
