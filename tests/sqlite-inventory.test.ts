import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {inventorySqlite} from '../scripts/inventory-sqlite';

test('migration inventory discovers dynamic tables, malformed JSON and orphan relationships without altering data',()=>{
 const dir=mkdtempSync(join(tmpdir(),'atlas-inventory-'));
 const path=join(dir,'fixture.sqlite');
 try{
  const db=new DatabaseSync(path);
  db.exec(`CREATE TABLE datasets(id TEXT PRIMARY KEY,payload TEXT);
   CREATE TABLE patents(dataset_id TEXT,id TEXT,payload TEXT);
   CREATE TABLE claim_checkpoints(dataset_id TEXT,patent_id TEXT,payload TEXT);
   INSERT INTO datasets VALUES('one','{}');
   INSERT INTO patents VALUES('one','valid','{}'),('missing','invalid','broken');
   INSERT INTO claim_checkpoints VALUES('one','valid','{}');`);
  db.close();
  const inventory=inventorySqlite(path);
  assert.equal(inventory.tables.find(table=>table.name==='patents')!.count,2);
  assert.equal(inventory.tables.find(table=>table.name==='patents')!.invalidJson,1);
  assert.equal(inventory.relations.find(relation=>relation.child==='patents')!.missingParents,1);
  assert.equal(inventory.tables.find(table=>table.name==='claim_checkpoints')!.count,1);
  assert.deepEqual(inventorySqlite(path),inventory);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
