import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareClaims} from '../src/server/claim-comparison';
import type {Patent} from '../src/lib/types';
const records=[{id:'A',sourceUrl:'https://example.com/a',publicationDate:'2022-01-01'},{id:'B',sourceUrl:'https://example.com/b',publicationDate:'2020-01-01'}] as Patent[];
const extract=async()=>[{patent:'A',claim:1,element:'processor',quote:'a processor',claim_offset:3},{patent:'A',claim:1,element:'ledger',quote:'a ledger',claim_offset:20},{patent:'B',claim:1,element:'processor',quote:'the processor',claim_offset:5}];
test('claim comparison takes quotations from extracted source indices, not model-written quotes',async()=>{const request=async()=>JSON.stringify({matches:[{source:'S0',target:'T0',relation:'supported',reason:'same processor'},{source:'S1',target:null,relation:'not_found',reason:'ledger not in supplied candidate'}]});const rows=await compareClaims('test',records,[1],undefined,undefined,request,extract);assert.equal(rows[0].target_quote,'the processor');assert.equal(rows[1].target_quote,null);assert.equal(rows[0].quote,'a processor');assert.equal(rows[0].target_offset,5);});
test('missing rows, invented target evidence, and duplicate source rows are rejected',async()=>{await assert.rejects(()=>compareClaims('test',records,[1],undefined,undefined,async()=>JSON.stringify({matches:[{source:'S0',target:'T100',relation:'supported',reason:'invented'},{source:'S1',target:null,relation:'not_found',reason:'x'}]}),extract),/证据索引/);});
