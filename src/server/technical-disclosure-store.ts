import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Pool} from 'pg';
import {connection,currentAccess,transaction} from './postgres';
import {prepareDisclosure,disclosureDraft} from './technical-disclosure';

function snapshot(input:unknown){const prepared=prepareDisclosure(input);return {...prepared,draft:prepared.readyForDraft?disclosureDraft(prepared.source):null};}
export class TechnicalDisclosures{
 constructor(private readonly pool:Pool){}
 async list(){return (await connection(this.pool).query('SELECT id,title,revision,created_at,updated_at FROM technical_disclosures ORDER BY updated_at DESC,id')).rows;}
 async read(id:string,revision?:number){
  if(revision!==undefined)z.number().int().positive().parse(revision);
  const row=(await connection(this.pool).query("SELECT d.id,v.snapshot->'source'->>'title' AS title,v.revision,v.snapshot,v.created_at FROM technical_disclosures d JOIN technical_disclosure_versions v ON v.disclosure_id=d.id AND v.revision=coalesce($2,d.revision) WHERE d.id=$1",[id,revision??null])).rows[0];
  if(!row)throw new Error('交底材料不存在或无阅读权限');return row;
 }
 async create(input:unknown){
  const value=snapshot(input),scope=currentAccess();if(!scope)throw new Error('保存交底材料需要项目身份');
  const id=randomUUID();
  return transaction(this.pool,async db=>{
   await db.query('INSERT INTO technical_disclosures(id,organization_id,project_id,creator_id,title,revision) VALUES($1,$2,$3,$4,$5,1)',[id,scope.organizationId,scope.projectId,scope.userId,value.source.title]);
   await db.query('INSERT INTO technical_disclosure_versions(disclosure_id,revision,organization_id,project_id,author_id,snapshot) VALUES($1,1,$2,$3,$4,$5)',[id,scope.organizationId,scope.projectId,scope.userId,JSON.stringify(value)]);
   return {id,revision:1,snapshot:value};
  });
 }
 async update(id:string,input:unknown){
  const data=z.object({expectedRevision:z.number().int().positive(),source:z.unknown()}).parse(input),value=snapshot(data.source),scope=currentAccess();if(!scope)throw new Error('修改交底材料需要项目身份');
  return transaction(this.pool,async db=>{
   const row=(await db.query('SELECT revision FROM technical_disclosures WHERE id=$1 FOR UPDATE',[id])).rows[0];
   if(!row)throw new Error('交底材料不存在或无修改权限');
   if(row.revision!==data.expectedRevision)throw new Error('材料已有新版本，请重新读取后修改');
   const revision=row.revision+1;
   await db.query('INSERT INTO technical_disclosure_versions(disclosure_id,revision,organization_id,project_id,author_id,snapshot) VALUES($1,$2,$3,$4,$5,$6)',[id,revision,scope.organizationId,scope.projectId,scope.userId,JSON.stringify(value)]);
   await db.query('UPDATE technical_disclosures SET title=$2,revision=$3,updated_at=now() WHERE id=$1',[id,value.source.title,revision]);
   return {id,revision,snapshot:value};
  });
 }
 async remove(id:string){const result=await connection(this.pool).query('DELETE FROM technical_disclosures WHERE id=$1 RETURNING id',[id]);if(!result.rowCount)throw new Error('交底材料不存在或无删除权限');}
}
