import {test} from 'node:test';
import assert from 'node:assert/strict';
import {claimStructure,splitClaimText} from '../src/lib/claim-structure';
import {dltPatent} from '../src/server/importers';
test('DLT import preserves bold claim numbers and exact source positions',()=>{
 const raw='### Claims\n\n**1**. A device.\n **2**. The device of claim 1.\n\n### Description\nA description.',patent=dltPatent({'Document ID':'US999001B1',Title:'fixture',text:raw});assert.deepEqual(patent.claims.map(claim=>claim.number),[1,2]);for(const claim of patent.claims)assert.equal(raw.slice(claim.sourceStart,claim.sourceEnd),claim.text);assert.deepEqual(claimStructure(patent.claims).edges,[{from:2,to:1}]);
});
test('merged DLT markdown claims split at original headings without rewriting source text',()=>{
 const text='**1**. A device.\n\n**2**. The device of claim 1.\n\n**3**. (Canceled)',claim={number:1,text,sourceStart:100};const split=splitClaimText(claim);assert.equal(split.map(part=>part.text).join(''),text);assert.equal(split[1].sourceStart,100+text.indexOf('**2**'));const result=claimStructure([claim]);assert.deepEqual(result.nodes.map(node=>node.status),['independent','dependent','cancelled']);assert.deepEqual(result.edges,[{from:2,to:1}]);assert.equal(result.nodes[1].sourceClaimNumber,1);assert.equal(result.nodes[1].sourceClaimOffset,text.indexOf('**2**'));
});
test('claim structure parses English lists and ranges with exact source references',()=>{
 const claims=[{number:1,text:'1. A sensor system.'},{number:2,text:'2. The system of claim 1, wherein a valve opens.'},{number:3,text:'3. The system of claims 1 or 2.'},{number:4,text:'4. The system according to claims 1 through 3.'}];
 const result=claimStructure(claims);assert.deepEqual(result.nodes.map(node=>node.status),['independent','dependent','dependent','dependent']);assert.deepEqual(result.nodes[3].dependsOn,[1,2,3]);
 for(const node of result.nodes)for(const reference of node.references)assert.equal(node.text.slice(reference.start,reference.end),reference.quote);
 assert.deepEqual(result.edges.filter(edge=>edge.from===3),[{from:3,to:1},{from:3,to:2}]);
 assert.deepEqual(claimStructure([...claims,{number:5,text:'The system of claims 1, 2, or 3.'}]).nodes.at(-1)?.dependsOn,[1,2,3]);
 assert.equal(claimStructure([{number:1,text:'A system processing an insurance claim.'}]).nodes[0].status,'independent');
});
test('Chinese references, cancellation and unnumbered references remain distinct',()=>{
 const result=claimStructure([{number:1,text:'一种传感装置。'},{number:2,text:'根据权利要求1所述的装置。'},{number:3,text:'根据权利要求1、2所述的装置。'},{number:4,text:'根据权利要求1至3任一项所述的方法。'},{number:5,text:'5. (Canceled)'},{number:6,text:'根据前述权利要求所述的装置。'}]);
 assert.deepEqual(result.nodes[3].dependsOn,[1,2,3]);assert.equal(result.nodes[4].status,'cancelled');assert.equal(result.nodes[5].status,'unresolved');assert.equal(result.nodes[5].dependsOn.length,0);
});
test('source headings naming their own claim are not self dependencies',()=>{
 const result=claimStructure([{number:1,text:'**1**. Claim 1 is the use of a signature.\n **2**. Claim 2 outlines an issuer purchasing a reserve.\n **3**. Claim 3 represents a transaction.'}]);assert.deepEqual(result.nodes.map(node=>node.status),['independent','independent','independent']);assert.equal(result.edges.length,0);
});
test('missing, forward and duplicate references are reported rather than fabricated',()=>{
 const result=claimStructure([{number:1,text:'claim 3'},{number:2,text:'claim 7'},{number:3,text:'A device.'},{number:3,text:'Another device.'},{number:4,text:'claims 1 and 3'}]);
 assert.equal(result.nodes[0].status,'unresolved');assert.match(result.nodes[1].issues[0],/未包含/);assert.equal(result.nodes[2].status,'unresolved');assert.equal(result.nodes[4].status,'unresolved');assert.deepEqual(result.nodes[1].dependsOn,[7]);assert.ok(result.edges.every(edge=>edge.to!==7&&edge.to!==3));
});
