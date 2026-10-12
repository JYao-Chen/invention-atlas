import {randomBytes,randomUUID,scrypt,timingSafeEqual} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {connection,transaction} from './postgres';

export type User={id:string;username:string;displayName:string;platformRole:'admin'|'member';enabled:boolean};
export type UserSession=User&{projectId:string|null};
type StoredUser=User&{passwordHash:string};
const fields='id,username,display_name AS "displayName",platform_role AS "platformRole",enabled';
async function derive(password:string,salt:string){
 return new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,64,(error,value)=>error?reject(error):resolve(value)));
}
export async function passwordHash(password:string){
 if(password.length<10||password.length>1024)throw new Error('密码长度应为10至1024字符');
 const salt=randomBytes(16).toString('hex');
 return 'scrypt:'+salt+':'+(await derive(password,salt)).toString('hex');
}
export async function verifyPassword(password:string,encoded:string){
 const [method,salt,hash]=encoded.split(':');
 if(method!=='scrypt'||!salt||!hash)return false;
 const expected=Buffer.from(hash,'hex'),actual=await derive(password,salt);
 return expected.length===actual.length&&timingSafeEqual(expected,actual);
}

export class IdentityStore {
 constructor(private readonly pool:Pool){}
 private get connection(){return connection(this.pool);}

 async initializeAdmin(username:string,password:string,organizationName:string){
  if(!username.trim()||!organizationName.trim())throw new Error('账号和组织名称不能为空');
  const hash=await passwordHash(password);
  return transaction(this.pool,async client=>{
   await client.query('SELECT pg_advisory_xact_lock(3017002)');
   if((await client.query('SELECT id FROM users LIMIT 1')).rowCount)throw new Error('管理员已初始化，不可覆盖已有账号');
   const id=randomUUID(),organizationId=randomUUID(),projectId=randomUUID();
   await client.query("INSERT INTO users(id,username,display_name,password_hash,platform_role) VALUES($1,$2,$2,$3,'admin')",[id,username.trim(),hash]);
   await client.query('INSERT INTO organizations(id,name) VALUES($1,$2)',[organizationId,organizationName.trim()]);
   await client.query("INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,'admin')",[organizationId,id]);
   await client.query("INSERT INTO projects(id,organization_id,name) VALUES($1,$2,'默认项目')",[projectId,organizationId]);
   await client.query("INSERT INTO project_members(organization_id,project_id,user_id,role) VALUES($1,$2,$3,'owner')",[organizationId,projectId,id]);
   for(const table of ['datasets','conversations','runs','reports','results','settings','monitors','claim_checkpoints','effect_checkpoints','comparison_checkpoints'])await client.query(`UPDATE ${table} SET organization_id=$1,project_id=$2 WHERE organization_id IS NULL AND project_id IS NULL`,[organizationId,projectId]);
   await client.query("INSERT INTO user_preferences(user_id,key,value) SELECT $1,'active_dataset:'||$2,value FROM settings WHERE key='active_dataset'",[id,projectId]);
   await client.query("INSERT INTO activity_logs(actor_id,organization_id,action,subject_id) VALUES($1,$2,'initialize-admin',$1)",[id,organizationId]);
   return {user:await this.user(id),organizationId,projectId};
  });
 }

 async user(id:string):Promise<User|undefined>{
  return (await this.connection.query(`SELECT ${fields} FROM users WHERE id=$1`,[id])).rows[0];
 }

 async authenticate(username:string,password:string):Promise<User|undefined>{
  if(password.length>1024)return undefined;
  const stored:StoredUser|undefined=(await this.connection.query(`SELECT ${fields},password_hash AS "passwordHash" FROM users WHERE username=$1`,[username])).rows[0];
  if(!stored?.enabled||!await verifyPassword(password,stored.passwordHash))return undefined;
  const {passwordHash:_,...user}=stored;return user;
 }

 async createSession(userId:string){
  const token=randomBytes(32).toString('hex');
  const user=await this.user(userId);if(!user?.enabled)throw new Error('账号不可用');
  const project=(await this.projects(userId))[0];
  await this.connection.query('INSERT INTO sessions(token,expires_at,user_id,project_id) VALUES($1,$2,$3,$4)',[token,Date.now()+7*86400000,userId,project?.id||null]);
  return token;
 }

 async sessionUser(token:string):Promise<User|undefined>{
  const session=await this.session(token);if(!session)return undefined;
  const {projectId:_,...user}=session;return user;
 }

 async session(token:string):Promise<UserSession|undefined>{
  return (await this.connection.query(`SELECT u.id,u.username,u.display_name AS "displayName",u.platform_role AS "platformRole",u.enabled,s.project_id AS "projectId" FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=$1 AND s.expires_at>$2 AND u.enabled`,[token,Date.now()])).rows[0];
 }

 async chooseProject(token:string,userId:string,projectId:string){
  if(!await this.projectRole(userId,projectId))throw new Error('没有该项目的访问权限');
  const updated=await this.connection.query('UPDATE sessions SET project_id=$1 WHERE token=$2 AND user_id=$3 AND expires_at>$4',[projectId,token,userId,Date.now()]);
  if(!updated.rowCount)throw new Error('会话已失效');
 }

 async changePassword(userId:string,currentPassword:string,newPassword:string){
  const user=await this.user(userId);
  if(!user||!await this.authenticate(user.username,currentPassword))throw new Error('当前密码错误');
  const hash=await passwordHash(newPassword);
  await transaction(this.pool,async client=>{
   await client.query('UPDATE users SET password_hash=$1 WHERE id=$2',[hash,userId]);
   await client.query('DELETE FROM sessions WHERE user_id=$1',[userId]);
  });
 }

 async users(actorId:string){
  const actor=await this.user(actorId);
  if(!actor?.enabled||actor.platformRole!=='admin')throw new Error('需要平台管理员权限');
  return (await this.connection.query(`SELECT ${fields} FROM users ORDER BY username`)).rows as User[];
 }

 async organizationMembers(actorId:string,organizationId:string){
  if(await this.organizationRole(actorId,organizationId)!=='admin')throw new Error('需要本组织管理员权限');
  return (await this.connection.query('SELECT u.id,u.username,u.display_name AS "displayName",u.enabled,m.role FROM organization_members m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 ORDER BY u.username',[organizationId])).rows;
 }

 async setEnabled(actorId:string,userId:string,enabled:boolean){
  if((await this.user(actorId))?.platformRole!=='admin'||!(await this.user(actorId))?.enabled)throw new Error('需要平台管理员权限');
  if(actorId===userId&&!enabled)throw new Error('不能停用自己的管理员账号');
  await transaction(this.pool,async client=>{
   const result=await client.query('UPDATE users SET enabled=$1 WHERE id=$2',[enabled,userId]);
   if(!result.rowCount)throw new Error('账号不存在');
   if(!enabled)await client.query('DELETE FROM sessions WHERE user_id=$1',[userId]);
   await client.query("INSERT INTO activity_logs(actor_id,action,subject_id) VALUES($1,'set-user-enabled',$2)",[actorId,userId]);
  });
 }

 async resetPassword(actorId:string,userId:string,password:string){
  const actor=await this.user(actorId);
  if(!actor?.enabled||actor.platformRole!=='admin')throw new Error('需要平台管理员权限');
  const hash=await passwordHash(password);
  await transaction(this.pool,async client=>{
   const updated=await client.query('UPDATE users SET password_hash=$1 WHERE id=$2',[hash,userId]);
   if(!updated.rowCount)throw new Error('账号不存在');
   await client.query('DELETE FROM sessions WHERE user_id=$1',[userId]);
   await client.query("INSERT INTO activity_logs(actor_id,action,subject_id) VALUES($1,'reset-password',$2)",[actorId,userId]);
  });
 }

 async createOrganization(actorId:string,name:string){
  const actor=await this.user(actorId);
  if(!actor?.enabled||actor.platformRole!=='admin')throw new Error('需要平台管理员权限');
  if(!name.trim())throw new Error('组织名称不能为空');
  return transaction(this.pool,async client=>{
   const id=randomUUID();
   await client.query('INSERT INTO organizations(id,name) VALUES($1,$2)',[id,name.trim()]);
   await client.query("INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,'admin')",[id,actorId]);
   await client.query("INSERT INTO activity_logs(actor_id,organization_id,action,subject_id) VALUES($1,$2,'create-organization',$2)",[actorId,id]);
   return {id,name:name.trim()};
  });
 }

 async organizationRole(userId:string,organizationId:string):Promise<'admin'|'member'|undefined>{
  return (await this.connection.query('SELECT m.role FROM organization_members m JOIN users u ON u.id=m.user_id WHERE m.user_id=$1 AND m.organization_id=$2 AND u.enabled',[userId,organizationId])).rows[0]?.role;
 }

 async organizations(userId:string):Promise<{id:string;name:string;role:'admin'|'member'}[]>{
  return (await this.connection.query('SELECT o.id,o.name,m.role FROM organizations o JOIN organization_members m ON m.organization_id=o.id JOIN users u ON u.id=m.user_id WHERE m.user_id=$1 AND u.enabled ORDER BY o.created_at,o.id',[userId])).rows;
 }

 async updateOrganizationMember(actorId:string,organizationId:string,userId:string,role:'admin'|'member'|null){
  await transaction(this.pool,async client=>{
   const members=(await client.query('SELECT user_id,role FROM organization_members WHERE organization_id=$1 FOR UPDATE',[organizationId])).rows;
   if(await this.organizationRole(actorId,organizationId)!=='admin')throw new Error('需要本组织管理员权限');
   const member=members.find(m=>m.user_id===userId);if(!member)throw new Error('组织成员不存在');
   if(role!=='admin'&&member.role==='admin'&&members.filter(m=>m.role==='admin').length===1)throw new Error('组织必须保留至少一名管理员');
   if(role===null){
    const projects=(await client.query('SELECT project_id,user_id,role FROM project_members WHERE organization_id=$1 FOR UPDATE',[organizationId])).rows;
    if(projects.some(m=>m.user_id===userId&&m.role==='owner'&&!projects.some(other=>other.project_id===m.project_id&&other.user_id!==userId&&other.role==='owner')))throw new Error('请先为成员负责的项目分配另一名负责人');
    await client.query('UPDATE sessions SET project_id=NULL WHERE user_id=$1 AND project_id IN(SELECT id FROM projects WHERE organization_id=$2)',[userId,organizationId]);
    await client.query('DELETE FROM project_members WHERE organization_id=$1 AND user_id=$2',[organizationId,userId]);
    await client.query('DELETE FROM organization_members WHERE organization_id=$1 AND user_id=$2',[organizationId,userId]);
   }else await client.query('UPDATE organization_members SET role=$1 WHERE organization_id=$2 AND user_id=$3',[role,organizationId,userId]);
   await client.query('INSERT INTO activity_logs(actor_id,organization_id,action,subject_id) VALUES($1,$2,$3,$4)',[actorId,organizationId,role===null?'remove-organization-member':'set-organization-member',userId]);
  });
 }

 async createInvite(actorId:string,organizationId:string){
  if(await this.organizationRole(actorId,organizationId)!=='admin')throw new Error('需要本组织管理员权限');
  const token=randomBytes(32).toString('hex'),expiresAt=new Date(Date.now()+48*3600000);
  await this.connection.query('INSERT INTO invites(token,organization_id,created_by,expires_at) VALUES($1,$2,$3,$4)',[token,organizationId,actorId,expiresAt]);
  return {token,expiresAt:expiresAt.toISOString()};
 }

 private async consumeInvite(client:PoolClient,token:string,userId:string){
  const invite=(await client.query('SELECT organization_id,expires_at,consumed_at FROM invites WHERE token=$1 FOR UPDATE',[token])).rows[0];
  if(!invite||invite.consumed_at||new Date(invite.expires_at).getTime()<=Date.now())throw new Error('邀请不存在、已使用或已过期');
  await client.query("INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,'member') ON CONFLICT(organization_id,user_id) DO NOTHING",[invite.organization_id,userId]);
  await client.query('UPDATE invites SET consumed_by=$1,consumed_at=now() WHERE token=$2',[userId,token]);
  await client.query("INSERT INTO activity_logs(actor_id,organization_id,action,subject_id) VALUES($1,$2,'accept-invite',$1)",[userId,invite.organization_id]);
  return {organizationId:invite.organization_id as string};
 }

 async registerInvitation(token:string,username:string,password:string,displayName:string){
  if(!username.trim()||username.trim().length>80||!displayName.trim())throw new Error('请填写有效账号和姓名');
  const hash=await passwordHash(password);
  return transaction(this.pool,async client=>{
   const id=randomUUID();
   await client.query('INSERT INTO users(id,username,display_name,password_hash) VALUES($1,$2,$3,$4)',[id,username.trim(),displayName.trim(),hash]);
   const membership=await this.consumeInvite(client,token,id);
   return {user:(await this.user(id))!,...membership};
  });
 }

 async acceptInvite(token:string,userId:string){
  if(!(await this.user(userId))?.enabled)throw new Error('账号不可用');
  return transaction(this.pool,client=>this.consumeInvite(client,token,userId));
 }

 async createProject(actorId:string,organizationId:string,name:string,description=''){
  if(await this.organizationRole(actorId,organizationId)!=='admin')throw new Error('需要本组织管理员权限');
  if(!name.trim())throw new Error('项目名称不能为空');
  return transaction(this.pool,async client=>{
   const id=randomUUID();
   await client.query('INSERT INTO projects(id,organization_id,name,description) VALUES($1,$2,$3,$4)',[id,organizationId,name.trim(),description]);
   await client.query("INSERT INTO project_members(organization_id,project_id,user_id,role) VALUES($1,$2,$3,'owner')",[organizationId,id,actorId]);
   return {id,organizationId,name:name.trim(),description};
  });
 }

 async projectRole(userId:string,projectId:string):Promise<'owner'|'analyst'|'reader'|undefined>{
  return (await this.connection.query('SELECT p.role FROM project_members p JOIN organization_members m ON m.organization_id=p.organization_id AND m.user_id=p.user_id JOIN users u ON u.id=p.user_id WHERE p.project_id=$1 AND p.user_id=$2 AND u.enabled',[projectId,userId])).rows[0]?.role;
 }

 async projects(userId:string){
  return (await this.connection.query('SELECT p.id,p.organization_id AS "organizationId",p.name,p.description,m.role FROM projects p JOIN project_members m ON m.project_id=p.id JOIN organization_members o ON o.organization_id=m.organization_id AND o.user_id=m.user_id JOIN users u ON u.id=m.user_id WHERE m.user_id=$1 AND u.enabled ORDER BY p.created_at,p.id',[userId])).rows;
 }

 async projectCandidates(actorId:string,projectId:string){
  if(await this.projectRole(actorId,projectId)!=='owner')throw new Error('需要项目负责人权限');
  return (await this.connection.query('SELECT u.id,u.username,u.display_name AS "displayName",u.enabled FROM projects p JOIN organization_members m ON m.organization_id=p.organization_id JOIN users u ON u.id=m.user_id WHERE p.id=$1 AND u.enabled ORDER BY u.username',[projectId])).rows;
 }

 async projectMembers(actorId:string,projectId:string){
  if(!await this.projectRole(actorId,projectId))throw new Error('没有本项目访问权限');
  return (await this.connection.query('SELECT u.id,u.username,u.display_name AS "displayName",u.enabled,m.role FROM project_members m JOIN users u ON u.id=m.user_id WHERE m.project_id=$1 ORDER BY u.username',[projectId])).rows;
 }

 async removeProjectMember(actorId:string,projectId:string,userId:string){
  await transaction(this.pool,async client=>{
   const members=(await client.query('SELECT user_id,role FROM project_members WHERE project_id=$1 FOR UPDATE',[projectId])).rows;
   if(await this.projectRole(actorId,projectId)!=='owner')throw new Error('需要项目负责人权限');
   const member=members.find(member=>member.user_id===userId);
   if(!member)throw new Error('项目成员不存在');
   if(member.role==='owner'&&members.filter(member=>member.role==='owner').length===1)throw new Error('项目必须保留至少一名负责人');
   await client.query('DELETE FROM project_members WHERE project_id=$1 AND user_id=$2',[projectId,userId]);
   await client.query('UPDATE sessions SET project_id=NULL WHERE user_id=$1 AND project_id=$2',[userId,projectId]);
   await client.query("INSERT INTO activity_logs(actor_id,organization_id,action,subject_id) SELECT $1,organization_id,'remove-project-member',$3 FROM projects WHERE id=$2",[actorId,projectId,userId]);
  });
 }

 async setProjectMember(actorId:string,projectId:string,userId:string,role:'owner'|'analyst'|'reader'){
  if(!['owner','analyst','reader'].includes(role))throw new Error('项目角色无效');
  await transaction(this.pool,async client=>{
   const members=(await client.query('SELECT user_id,role FROM project_members WHERE project_id=$1 FOR UPDATE',[projectId])).rows;
   if(await this.projectRole(actorId,projectId)!=='owner')throw new Error('需要项目负责人权限');
   if(role!=='owner'&&members.some(member=>member.user_id===userId&&member.role==='owner')&&members.filter(member=>member.role==='owner').length===1)throw new Error('项目必须保留至少一名负责人');
   const project=(await client.query('SELECT organization_id FROM projects WHERE id=$1',[projectId])).rows[0];
   if(!await this.organizationRole(userId,project.organization_id))throw new Error('成员不属于本组织');
   await client.query('INSERT INTO project_members(organization_id,project_id,user_id,role) VALUES($1,$2,$3,$4) ON CONFLICT(project_id,user_id) DO UPDATE SET role=excluded.role',[project.organization_id,projectId,userId,role]);
   await client.query("INSERT INTO activity_logs(actor_id,organization_id,action,subject_id) VALUES($1,$2,'set-project-member',$3)",[actorId,project.organization_id,userId]);
  });
 }
}
