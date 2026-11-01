import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {identity} from '../src/server/auth';
import {identityEndpoint,apiCredentialRequest} from '../src/server/api-access';
import {db} from '../src/server/db';
import {passwordHash} from '../src/server/identity';
function request(token:string,method='GET',body?:unknown,userId?:string){return new Request('https://localhost/api/login-devices'+(userId?'?userId='+userId:''),{method,headers:{cookie:'patent_session='+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});}
test('login devices preserve legacy sessions, isolate users and revoke individual/other sessions',async()=>{
 const init=await identity.initializeAdmin('devices-admin','device-password-123','设备测试'),admin=init.user!.id;
 const member=randomUUID();await db.query('INSERT INTO users(id,username,display_name,password_hash) VALUES($1,$2,$2,$3)',[member,'device-member',await passwordHash('member-password-123')]);
 const current=await identity.createSession(admin,{userAgent:'Firefox/130 Linux',ipAddress:'127.0.0.1'}),other=await identity.createSession(admin,{userAgent:'Safari/605 iPhone'}),memberToken=await identity.createSession(member);
 const legacy=randomUUID();await db.query('INSERT INTO sessions(token,expires_at,user_id) VALUES($1,$2,$3)',[legacy,Date.now()+86400000,admin]);
 const expired=await identity.createSession(admin);await db.query('UPDATE sessions SET expires_at=0 WHERE token=$1',[expired]);
 const response=await identityEndpoint(request(current),['login-devices']);assert.equal(response?.status,200);assert.equal(response!.headers.get('cache-control'),'no-store');
 const {devices}=await response!.json();assert.equal(devices.length,3);assert.equal(devices.filter((d:{current:boolean})=>d.current).length,1);assert.ok(devices.every((d:object)=>!('token' in d)&&!('user_id' in d)));
 const active=devices.find((d:{current:boolean})=>d.current);assert.equal(active.userAgent,'Firefox/130 Linux');assert.equal(active.ipAddress,'127.0.0.1');assert.ok(active.createdAt>0);assert.ok(active.expiresAt-active.createdAt<=7*86400000+1000);
 assert.ok(devices.some((d:{createdAt:number|null})=>d.createdAt===null));
 const before=(await db.query('SELECT last_active_at,expires_at FROM sessions WHERE token=$1',[current])).rows[0];
 await identity.session(current);assert.deepEqual((await db.query('SELECT last_active_at,expires_at FROM sessions WHERE token=$1',[current])).rows[0],before);
 await db.query('UPDATE sessions SET last_active_at=0 WHERE token=$1',[current]);await identity.session(current);assert.ok(Number((await db.query('SELECT last_active_at FROM sessions WHERE token=$1',[current])).rows[0].last_active_at)>0);
 assert.equal((await identityEndpoint(request(memberToken,'GET',undefined,admin),['login-devices']))?.status,403);
 assert.equal((await identityEndpoint(request(memberToken,'DELETE',{others:true},admin),['login-devices']))?.status,403);
 assert.equal((await identityEndpoint(request(memberToken),['login-devices']))?.status,200);
 await assert.rejects(identity.revokeLoginDevices(member,admin,memberToken,active.id),/管理员权限/);
 assert.equal((await identityEndpoint(request('missing'),['login-devices']))?.status,401);
 const foreign=(await identity.loginDevices(admin,member,current))[0];
 assert.equal((await identity.revokeLoginDevices(admin,admin,current,foreign.id)).count,0);assert.ok(await identity.session(memberToken));
 const ownOther=devices.find((d:{userAgent:string})=>d.userAgent==='Safari/605 iPhone');
 const revoked=await identityEndpoint(request(current,'DELETE',{id:ownOther.id}),['login-devices']);assert.deepEqual(await revoked!.json(),{ok:true,count:1,loginRequired:false});assert.equal(await identity.session(other),undefined);assert.ok(await identity.session(current));
 const remainder=await identityEndpoint(request(current,'DELETE',{others:true}),['login-devices']);assert.equal((await remainder!.json()).count,2);assert.equal(await identity.session(legacy),undefined);assert.ok(await identity.session(current));
 const adminRevoke=await identityEndpoint(request(current,'DELETE',{others:true},member),['login-devices']);assert.equal((await adminRevoke!.json()).count,1);assert.equal(await identity.session(memberToken),undefined);
 const logout=await identityEndpoint(request(current,'DELETE',{id:active.id}),['login-devices']);assert.equal((await logout!.json()).loginRequired,true);assert.match(logout!.headers.get('set-cookie')!,/Expires=Thu, 01 Jan 1970/);assert.equal(await identity.session(current),undefined);
});
test('HTTP login records browser and proxy IP; project API credentials cannot manage devices',async()=>{
 // This file shares its schema across tests.
 const response=await identityEndpoint(new Request('https://localhost/api/login',{method:'POST',headers:{'Content-Type':'application/json','user-agent':'Mozilla/5.0 Chrome/130 Windows','x-real-ip':'192.0.2.12'},body:JSON.stringify({username:'devices-admin',password:'device-password-123'})}),['login']);
 assert.equal(response?.status,200);const cookie=response!.headers.get('set-cookie')!.split(';')[0],token=cookie.split('=')[1];
 const session=await identity.session(token);assert.ok(session);
 const device=(await identity.loginDevices(session!.id,session!.id,token))[0];assert.equal(device.ipAddress,'192.0.2.12');assert.match(device.userAgent,/Chrome/);
 const {apiCredentials}=await import('../src/server/auth');const credential=await apiCredentials.create(session!.id,session!.projectId!,{name:'设备权限测试',access:'write'});
 const denied=await apiCredentialRequest(new Request('https://localhost/api/login-devices',{headers:{authorization:'Bearer '+credential.token}}),['login-devices'],async()=>{throw new Error('不应允许设备管理');});assert.equal(denied.status,403);
});
