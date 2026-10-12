import {test} from 'node:test';
import assert from 'node:assert/strict';
import {identity} from '../src/server/auth';
import {identityEndpoint,projectRequest} from '../src/server/api-access';
import {currentAccess} from '../src/server/postgres';

function request(path:string,method='GET',body?:unknown,cookie=''){
 return new Request('http://localhost/api/'+path,{method,headers:{'Content-Type':'application/json',cookie},body:body===undefined?undefined:JSON.stringify(body)});
}
test('HTTP identity endpoints bind project scope, enforce readers and revoke sessions',async()=>{
 const initialized=await identity.initializeAdmin('api-admin','api-admin-password','API组织');
 assert.equal((await identityEndpoint(request('workspace'),['workspace']))?.status,401);
 assert.equal((await identityEndpoint(request('login','POST',{username:'api-admin',password:'incorrect'}),['login']))?.status,401);
 const login=await identityEndpoint(request('login','POST',{username:'api-admin',password:'api-admin-password'}),['login']);
 assert.equal(login?.status,200);
 const cookie=login!.headers.get('set-cookie')!.split(';')[0];
 const workspace=await identityEndpoint(request('workspace','GET',undefined,cookie),['workspace']);
 assert.equal((await workspace!.json()).current.id,initialized.projectId);
 const scoped=await projectRequest(request('datasets','GET',undefined,cookie),['datasets'],async()=>Response.json(currentAccess()));
 assert.equal((await scoped.json()).projectId,initialized.projectId);
 const invite=await identity.createInvite(initialized.user!.id,initialized.organizationId);
 const registration=await identityEndpoint(request('register','POST',{token:invite.token,username:'api-reader',password:'api-reader-password',displayName:'只读成员'}),['register']);
 assert.equal(registration?.status,200);
 const registrationCookie=registration!.headers.get('set-cookie')!.split(';')[0];
 const firstWorkspace=await identityEndpoint(request('workspace','GET',undefined,registrationCookie),['workspace']);
 const first=await firstWorkspace!.json();assert.equal(first.current,null);assert.deepEqual(first.projects,[]);
 const registered={user:(await identity.authenticate('api-reader','api-reader-password'))!};
 await identity.setProjectMember(initialized.user!.id,initialized.projectId,registered.user.id,'reader');
 const readerLogin=await identityEndpoint(request('login','POST',{username:'api-reader',password:'api-reader-password'}),['login']);
 const readerCookie=readerLogin!.headers.get('set-cookie')!.split(';')[0];
 let executed=false;
 const denied=await projectRequest(request('runs','POST',{},readerCookie),['runs'],async()=>{executed=true;return Response.json({});});
 assert.equal(denied.status,403);assert.equal(executed,false);
 for(const path of [['patent-annotations','suggest'],['patent-annotations'],['patent-annotations','fixture','confirm'],['source-updates'],['source-updates','dlt'],['source-updates','preview'],['source-updates','fixture','resolve']]){
  let modelOrWriteCalled=false;
  const blocked=await projectRequest(request(path.join('/'),'POST',{datasetId:'private',patentId:'private'},readerCookie),path,async()=>{modelOrWriteCalled=true;return Response.json({});});
  assert.equal(blocked.status,403);assert.equal(modelOrWriteCalled,false);
 }
 for(const [method,path] of [['POST',['disclosures']],['PATCH',['disclosures','fixture']],['DELETE',['disclosures','fixture']],['POST',['disclosures','fixture','questions']]] as const){
  let disclosureOperationCalled=false;
  const blocked=await projectRequest(request(path.join('/'),method,{revision:1},readerCookie),[...path],async()=>{disclosureOperationCalled=true;return Response.json({});});
  assert.equal(blocked.status,403);assert.equal(disclosureOperationCalled,false);
 }
 for(const path of [['disclosures'],['disclosures','fixture'],['disclosures','fixture','markdown']]){
  const allowed=await projectRequest(request(path.join('/'),'GET',undefined,readerCookie),path,async()=>Response.json(currentAccess()));
  assert.equal(allowed.status,200);assert.equal((await allowed.json()).userId,registered.user.id);
 }
 const readNotification=await projectRequest(request('notifications/test-id','PATCH',{action:'read'},readerCookie),['notifications','test-id'],async()=>Response.json(currentAccess()));assert.equal(readNotification.status,200);assert.equal((await readNotification.json()).userId,registered.user.id);
 for(const method of ['POST','PATCH','DELETE']){
  let scheduleOperationCalled=false;
  const scheduleBlocked=await projectRequest(request('source-schedules/fixture',method,{},readerCookie),['source-schedules','fixture'],async()=>{scheduleOperationCalled=true;return Response.json({});});
  assert.equal(scheduleBlocked.status,403);assert.equal(scheduleOperationCalled,false);
  let subscriptionOperationCalled=false;
  const blocked=await projectRequest(request('monitor-subscriptions/fixture',method,{},readerCookie),['monitor-subscriptions','fixture'],async()=>{subscriptionOperationCalled=true;return Response.json({});});
  assert.equal(blocked.status,403);assert.equal(subscriptionOperationCalled,false);
 }
 assert.equal((await projectRequest(request('notifications','POST',{},readerCookie),['notifications'],async()=>Response.json({}))).status,403);
 const invalidProject=identityEndpoint(request('workspace','PATCH',{projectId:'not-authorized'},readerCookie),['workspace']);
 await assert.rejects(invalidProject);
 await identity.removeProjectMember(initialized.user!.id,initialized.projectId,registered.user.id);
 assert.equal((await projectRequest(request('datasets','GET',undefined,readerCookie),['datasets'],async()=>Response.json({}))).status,403);
 await identity.resetPassword(initialized.user!.id,registered.user.id,'new-reader-password');
 assert.equal((await identityEndpoint(request('workspace','GET',undefined,readerCookie),['workspace']))?.status,401);
});
