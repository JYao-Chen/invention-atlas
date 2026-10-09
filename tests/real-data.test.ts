import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import type {Patent} from '../src/lib/types';
const root=resolve('data/sources/dlt');
const available=existsSync(resolve(root,'patents.jsonl'));
const records:Patent[]=available?readFileSync(resolve(root,'patents.jsonl'),'utf8').split('\n').filter(Boolean).map(line=>JSON.parse(line)):[];
const originals=new Map<string,Record<string,unknown>>();
for(const file of (available?readdirSync(root):[]).filter(file=>/^rows-\d+\.json$/.test(file)))for(const item of JSON.parse(readFileSync(resolve(root,file),'utf8')).rows)originals.set(String(item.row['Document ID']).replace(/[^A-Z0-9]/g,''),item.row);
test('300 unique real source records, independently compared with cached source fields',{skip:!available?'Run npm run data:fetch to verify real source records':false},()=>{
 assert.equal(records.length,300);assert.equal(new Set(records.map(p=>p.id)).size,300);
 for(const p of records){const raw=originals.get(p.id);assert.ok(raw,p.id);assert.equal(p.title,raw.Title);assert.equal(p.rawText,raw.text);const sourceDate=String(raw['Date Published']);assert.equal(p.publicationDate,sourceDate.length===8?`${sourceDate.slice(0,4)}-${sourceDate.slice(4,6)}-${sourceDate.slice(6)}`:sourceDate);assert.ok(p.applicants.every(name=>String(raw['Applicant Name']).includes(name)));assert.ok(p.applicants.length>0);assert.ok(p.claims.length>0);assert.ok(p.description.length>0);assert.ok(!/Applicant:|Appl\. No\.:|Family ID:/.test(p.abstract));assert.ok(p.rawText.includes(p.abstract));}
 const named=records.find(p=>p.id==='US10102526B1')!;assert.deepEqual(named.applicants,['Madisetti; Vijay K.','Bahga; Arshdeep']);
});
test('IPC and citations have literal source support; claims locate exactly within original text',{skip:!available?'Run npm run data:fetch to verify real source records':false},()=>{
 let cited=0;
 for(const p of records){const ipcSection=p.rawText.split('Int. Cl.:')[1]?.split('U.S. Cl.:')[0]||'';for(const ipc of p.ipc)assert.ok(ipcSection.replace(/\s/g,'').includes(ipc),`${p.id} ${ipc}`);for(const claim of p.claims){assert.ok(claim.sourceStart!==undefined&&claim.sourceEnd!==undefined);assert.equal(p.rawText.slice(claim.sourceStart,claim.sourceEnd).trim(),claim.text);}
  for(const id of p.citations){const digits=id.slice(2);assert.ok(p.rawText.includes(digits)||p.rawText.includes(digits.slice(0,4)+'/'+digits.slice(4)),`${p.id}: ${id}`);}if(p.citations.length)cited++;
 }assert.equal(cited,140);assert.ok(records.every(p=>!p.legalStatus&&!p.familyMembers.length));
});
test('source year counts sum to actual sample size, not an imposed synthetic growth series',{skip:!available?'Run npm run data:fetch to verify real source records':false},()=>{const counts=new Map<string,number>();for(const p of records){const year=p.publicationDate.slice(0,4);counts.set(year,(counts.get(year)||0)+1);}assert.equal([...counts.values()].reduce((s,n)=>s+n,0),300);assert.equal([...counts.keys()].sort()[0],'2013');assert.equal([...counts.keys()].sort().at(-1),'2024');assert.ok(new Set(counts.values()).size>1);});
