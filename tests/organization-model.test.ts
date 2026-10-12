import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {randomBytes,randomUUID} from 'node:crypto';
import {IdentityStore} from '../src/server/identity';
import {withAccess} from '../src/server/postgres';
import {OrganizationModel,withOrganizationModel} from '../src/server/organization-model';
import {modelConfig} from '../src/server/config';
test('organization model credentials are encrypted, scoped, admin-managed and isolated during concurrent calls',async()=>{
 const admin=new Pool({connectionString:process.env.DATABASE_URL}),role='model_'+randomUUID().replaceAll('-','');
 const schema=(await admin.query('SELECT current_schema() AS name')).rows[0].name;
 await admin.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS`);await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);await admin.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${role}`);await admin.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO ${role}`);
 const url=new URL(process.env.DATABASE_URL!);url.username=role;const runtime=new Pool({connectionString:url.toString()}),previous=process.env.PATENT_MODEL_CREDENTIAL_KEY;process.env.PATENT_MODEL_CREDENTIAL_KEY=randomBytes(32).toString('hex');
 try{
 const identity=new IdentityStore(runtime),first=await identity.initializeAdmin('model-admin','model-password-123','first');const user=first.user!.id,second=await identity.createOrganization(user,'second');const project=await identity.createProject(user,second.id,'second-project');
 const a={userId:user,organizationId:first.organizationId,projectId:first.projectId},b={userId:user,organizationId:second.id,projectId:project.id},store=new OrganizationModel(runtime);
 await withAccess(a,()=>store.save({model:'model-a',base:'https://a.example/v1',apiKey:'secret-a'}));await withAccess(b,()=>store.save({model:'model-b',base:'https://b.example/v1',apiKey:'secret-b'}));
 assert.ok((await admin.query('SELECT encrypted_key FROM organization_models')).rows.every(row=>!row.encrypted_key.includes('secret')));
 assert.equal(JSON.stringify(await withAccess(a,()=>store.read())).includes('secret'),false);
 await Promise.all(Array.from({length:12},(_,index)=>withAccess(index%2?a:b,()=>withOrganizationModel(runtime,async()=>{await new Promise(resolve=>setTimeout(resolve,5));assert.equal(modelConfig().key,index%2?'secret-a':'secret-b');assert.equal(modelConfig().model,index%2?'model-a':'model-b');}))));
 await withAccess(a,()=>store.save({model:'model-a2',base:'https://a.example/v1'}));assert.equal((await withAccess(a,()=>store.runtime()))?.apiKey,'secret-a');
 await admin.query("UPDATE organization_members SET role='member' WHERE organization_id=$1 AND user_id=$2",[first.organizationId,user]);
 await assert.rejects(withAccess(a,()=>store.save({model:'no',base:'https://a.example/v1',apiKey:'no'})),/管理员/);await assert.rejects(withAccess(a,()=>store.remove()),/管理员/);
 await admin.query('DELETE FROM project_members WHERE organization_id=$1 AND user_id=$2',[first.organizationId,user]);await admin.query('DELETE FROM organization_members WHERE organization_id=$1 AND user_id=$2',[first.organizationId,user]);assert.equal(await withAccess(a,()=>store.runtime()),undefined);
 await withAccess(b,()=>store.remove());assert.equal(await withAccess(b,()=>store.runtime()),undefined);
 }finally{if(previous===undefined)delete process.env.PATENT_MODEL_CREDENTIAL_KEY;else process.env.PATENT_MODEL_CREDENTIAL_KEY=previous;await runtime.end();await admin.query(`DROP OWNED BY ${role}`);await admin.query(`DROP ROLE ${role}`);await admin.end();}
});
