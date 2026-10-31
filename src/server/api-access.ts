import {NextResponse} from 'next/server';
import {z} from 'zod';
import {identity,apiCredentials,authenticate,login,currentSession,logout,sessionToken,COOKIE} from './auth';
import {bearerToken} from './api-credentials';
import {withAccess} from './postgres';

const loginAttempts=new Map<string,{failures:number;expires:number}>();
const denied=(message:string,status=403)=>NextResponse.json({error:message},{status});
const projectSchema=z.object({projectId:z.string().min(1)});
function signedIn(userId:string,request:Request){
 return login(userId).then(token=>{
  const response=NextResponse.json({ok:true});
  response.cookies.set(COOKIE,token,{httpOnly:true,sameSite:'lax',secure:new URL(request.url).protocol==='https:'||request.headers.get('x-forwarded-proto')==='https',path:'/',maxAge:7*86400});
  return response;
 });
}

export async function identityEndpoint(request:Request,path:string[]):Promise<Response|undefined>{
 const [resource,id,action]=path,method=request.method;
 if(resource==='login'&&method==='POST'){
  const body=z.object({username:z.string().trim().min(1).max(80),password:z.string().max(1024)}).parse(await request.json());
  const now=Date.now();for(const [key,attempt] of loginAttempts)if(attempt.expires<=now)loginAttempts.delete(key);
  const key=body.username+'|'+(request.headers.get('x-real-ip')||'local');
  const attempt=loginAttempts.get(key);
  if(attempt&&attempt.failures>=5)return denied('登录尝试过多，请一分钟后重试',429);
  const user=await authenticate(body.username,body.password);
  if(!user){loginAttempts.set(key,{failures:(attempt?.failures||0)+1,expires:attempt?.expires||now+60000});return denied('用户名或密码错误',401);}
  loginAttempts.delete(key);return signedIn(user.id,request);
 }
 if(resource==='register'&&method==='POST'){
  const body=z.object({token:z.string().min(1),username:z.string().trim().min(1).max(80),displayName:z.string().trim().min(1).max(100),password:z.string().min(10).max(1024)}).parse(await request.json());
  const registered=await identity.registerInvitation(body.token,body.username,body.password,body.displayName);
  return signedIn(registered.user.id,request);
 }
 const session=await currentSession(request);
 if(!session)return denied('请先登录',401);
 if(resource==='api-credentials'){
  if(request.headers.has('authorization'))return denied('API凭据不能管理其他凭据');if(!session.projectId)return denied('请先选择项目');
  if(method==='GET'&&!id)return NextResponse.json({credentials:await apiCredentials.list(session.id,session.projectId)},{headers:{'Cache-Control':'no-store'}});
  if(method==='POST'&&!id)return NextResponse.json(await apiCredentials.create(session.id,session.projectId,await request.json()),{status:201,headers:{'Cache-Control':'no-store'}});
  if(method==='DELETE'&&id&&path.length===2)return NextResponse.json(await apiCredentials.revoke(session.id,session.projectId,id));return denied('凭据接口不支持此操作',405);
 }
 if(resource==='logout'){
  await logout(request);const response=NextResponse.json({ok:true});response.cookies.delete(COOKIE);return response;
 }
 if(resource==='account'){
  if(method==='GET'){const {projectId:_,...user}=session;return NextResponse.json({user});}
  if(method==='PATCH'){
   const body=z.object({currentPassword:z.string().max(1024),newPassword:z.string().min(10).max(1024)}).parse(await request.json());
   await identity.changePassword(session.id,body.currentPassword,body.newPassword);
   const response=NextResponse.json({ok:true,loginRequired:true});response.cookies.delete(COOKIE);return response;
  }
 }
 if(resource==='workspace'){
  if(method==='PATCH'){const {projectId}=projectSchema.parse(await request.json());await identity.chooseProject(sessionToken(request),session.id,projectId);}
  const projects=await identity.projects(session.id);
  const selected=method==='PATCH'?(await currentSession(request))?.projectId:session.projectId;
  return NextResponse.json({user:{id:session.id,username:session.username,displayName:session.displayName,platformRole:session.platformRole},projects,current:projects.find(project=>project.id===selected)||null});
 }
 if(resource==='organizations'){
  if(id&&action==='members'&&(method==='PATCH'||method==='DELETE')){
   const body=z.object({userId:z.string().min(1),role:z.enum(['admin','member']).optional()}).parse(await request.json());
   if(method==='PATCH'&&!body.role)throw new Error('请选择组织角色');
   await identity.updateOrganizationMember(session.id,id,body.userId,method==='DELETE'?null:body.role!);return NextResponse.json({ok:true});
  }
  if(id&&action==='members'&&method==='GET')return NextResponse.json({members:await identity.organizationMembers(session.id,id)});
  if(method==='GET')return NextResponse.json({organizations:await identity.organizations(session.id)});
  if(method==='POST'){const {name}=z.object({name:z.string().trim().min(1).max(100)}).parse(await request.json());return NextResponse.json(await identity.createOrganization(session.id,name));}
 }
 if(resource==='projects'){
  if(action==='candidates'&&method==='GET')return NextResponse.json({members:await identity.projectCandidates(session.id,id)});
  if(action==='members'&&method==='GET')return NextResponse.json({members:await identity.projectMembers(session.id,id)});
  if(action==='members'&&method==='DELETE'){
   const {userId}=z.object({userId:z.string().min(1)}).parse(await request.json());
   await identity.removeProjectMember(session.id,id,userId);return NextResponse.json({ok:true});
  }
  if(action==='members'&&method==='PATCH'){
   const body=z.object({userId:z.string().min(1),role:z.enum(['owner','analyst','reader'])}).parse(await request.json());
   await identity.setProjectMember(session.id,id,body.userId,body.role);return NextResponse.json({ok:true});
  }
  if(method==='GET')return NextResponse.json({projects:await identity.projects(session.id)});
  if(method==='POST'){const body=z.object({organizationId:z.string().min(1),name:z.string().trim().min(1).max(100),description:z.string().max(2000).default('')}).parse(await request.json());return NextResponse.json(await identity.createProject(session.id,body.organizationId,body.name,body.description));}
 }
 if(resource==='invites'&&method==='POST'){
  const {organizationId}=z.object({organizationId:z.string().min(1)}).parse(await request.json());
  return NextResponse.json(await identity.createInvite(session.id,organizationId));
 }
 if(resource==='join'&&method==='POST'){
  const {token}=z.object({token:z.string().min(1)}).parse(await request.json());
  return NextResponse.json(await identity.acceptInvite(token,session.id));
 }
 if(resource==='users'&&!id&&method==='GET')return NextResponse.json({users:await identity.users(session.id)});
 if(resource==='users'&&id&&method==='PATCH'){
  const body=z.discriminatedUnion('action',[z.object({action:z.literal('enabled'),enabled:z.boolean()}),z.object({action:z.literal('reset-password'),password:z.string().min(10).max(1024)})]).parse(await request.json());
  if(body.action==='enabled')await identity.setEnabled(session.id,id,body.enabled);else await identity.resetPassword(session.id,id,body.password);
  return NextResponse.json({ok:true});
 }
 return undefined;
}

export async function projectRequest(request:Request,path:string[],work:()=>Promise<Response>){
 const session=await currentSession(request);if(!session)return denied('请先登录',401);
 const projects=await identity.projects(session.id),project=projects.find(project=>project.id===session.projectId);
 if(!project)return denied('当前没有可访问的项目，请选择项目或联系负责人');
 const [resource]=path,method=request.method;
 if(resource==='settings'&&method!=='GET'&&session.platformRole!=='admin')return denied('需要平台管理员权限');
 if(project.role==='reader'&&method!=='GET'&&!(['datasets','notifications','monitor-notifications'].includes(resource)&&method==='PATCH'))return denied('当前项目为只读权限');
 if(project.role==='reader'&&resource==='starters'&&method==='GET')return NextResponse.json({version:'readonly',batches:[]});
 return withAccess({userId:session.id,organizationId:project.organizationId,projectId:project.id},work);
}
const externalResources=new Set(['openapi','datasets','patents','tools','fulltext','conversations','runs','results','reports','workflows','professional-tasks','research-tasks','project-labels','patent-annotations','disclosures','materials','monitor-subscriptions','monitor-notifications','source-updates','report-tasks','notifications','starters','retrieval-experiments']);
export async function apiCredentialRequest(request:Request,path:string[],work:()=>Promise<Response>){
 const credential=await apiCredentials.authenticate(bearerToken(request));if(!credential)return denied('API凭据无效、已过期或权限已撤销',401);
 if(!externalResources.has(path[0]))return denied('此接口不接受项目API凭据');
 const modelRead=path[0]==='starters'||path[0]==='fulltext'&&path[1]==='search',runWrite=path[0]==='runs'&&['stop','retry-report'].includes(path[2]);
 if(credential.apiAccess==='read'&&(request.method!=='GET'||modelRead||runWrite))return denied('此API凭据仅允许读取；分析、语义检索和写入需要写入权限');
 return projectRequest(request,path,work);
}
