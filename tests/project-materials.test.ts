import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {postgresPool,withAccess} from '../src/server/postgres';
import {IdentityStore} from '../src/server/identity';
import {ProjectMaterials} from '../src/server/project-materials';
test('ordinary project role saves exact originals, blocks foreign scope and removes material from active access',async()=>{
 const admin=postgresPool(),identity=new IdentityStore(admin),user=await identity.initializeAdmin('material-admin','material-password-123','Material fixture');
 const role='material_'+randomUUID().replaceAll('-',''),schema=(await admin.query('SELECT current_schema() AS name')).rows[0].name;
 const other=await identity.createProject(user.user!.id,user.organizationId,'Other material project');
 const root=await mkdtemp(join(tmpdir(),'atlas-material-test-')),previous=process.env.PATENT_DATA_DIR;process.env.PATENT_DATA_DIR=root;
 let runtime:ReturnType<typeof postgresPool>|undefined;
 try{
  await admin.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS`);await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);await admin.query(`GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA ${schema} TO ${role}`);
  const url=new URL(process.env.DATABASE_URL!);url.username=role;url.password='';runtime=postgresPool(url.toString());const materials=new ProjectMaterials(runtime);
  const scope={userId:user.user!.id,organizationId:user.organizationId,projectId:user.projectId};
  const file=new File(['材料原文\n第二段'],'方案.txt');
  const saved=await withAccess(scope,()=>materials.create(file));assert.equal(saved.extraction.saved,true);
  await withAccess(scope,async()=>{assert.equal((await materials.list()).length,1);assert.equal((await materials.original(saved.id)).bytes.toString(),'材料原文\n第二段');});
  await withAccess({...scope,projectId:other.id},async()=>{assert.deepEqual(await materials.list(),[]);await assert.rejects(materials.original(saved.id),/无访问权限/);await assert.rejects(materials.remove(saved.id),/无修改权限/);});
  await admin.query("UPDATE project_members SET role='reader' WHERE project_id=$1 AND user_id=$2",[scope.projectId,scope.userId]);
  await withAccess(scope,async()=>{assert.equal((await materials.original(saved.id)).bytes.toString(),'材料原文\n第二段');await assert.rejects(materials.create(new File(['拒绝保存'],'denied.txt')),/row-level security/);await assert.rejects(materials.remove(saved.id),/row-level security|无修改权限/);});
  await admin.query("UPDATE project_members SET role='owner' WHERE project_id=$1 AND user_id=$2",[scope.projectId,scope.userId]);
  await withAccess(scope,async()=>{assert.equal((await materials.remove(saved.id)).retainedOriginal,true);assert.deepEqual(await materials.list(),[]);await assert.rejects(materials.read(saved.id),/无访问权限/);});
 }finally{if(runtime)await runtime.end();await admin.query(`DROP OWNED BY ${role}`);await admin.query(`DROP ROLE ${role}`);if(previous===undefined)delete process.env.PATENT_DATA_DIR;else process.env.PATENT_DATA_DIR=previous;await rm(root,{recursive:true,force:true});}
});
