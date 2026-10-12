import {createHash,randomBytes,randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {z} from 'zod';
import {IdentityStore,type UserSession} from './identity';
import {connection,transaction} from './postgres';
const metadata='id,name,access,project_id AS "projectId",created_at AS "createdAt",expires_at AS "expiresAt",revoked_at AS "revokedAt"';
const digest=(token:string)=>createHash('sha256').update(token).digest('hex');
export type ApiIdentity=UserSession&{credentialId:string;apiAccess:'read'|'write'};
export class ApiCredentials{
 constructor(private readonly pool:Pool){}
 async create(userId:string,projectId:string,input:unknown){
  const data=z.object({name:z.string().trim().min(1).max(100),access:z.enum(['read','write']),days:z.number().int().min(1).max(365).default(90)}).strict().parse(input);
  return transaction(this.pool,async client=>{
   const project=(await new IdentityStore(this.pool).projects(userId)).find(item=>item.id===projectId);if(!project)throw new Error('项目不存在或无访问权限');if(data.access==='write'&&project.role==='reader')throw new Error('只读成员不能创建写入凭据');
   const id=randomUUID(),token='ia_'+id+'_'+randomBytes(32).toString('base64url');
   const credential=(await client.query(`INSERT INTO project_api_credentials(id,user_id,organization_id,project_id,name,access,token_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()+$8*interval '1 day') RETURNING ${metadata}`,[id,userId,project.organizationId,projectId,data.name,data.access,digest(token),data.days])).rows[0];
   await client.query("INSERT INTO activity_logs(actor_id,organization_id,action,subject_id) VALUES($1,$2,'create-api-credential',$3)",[userId,project.organizationId,id]);return {credential,token};
  });
 }
 async list(userId:string,projectId:string){return (await connection(this.pool).query(`SELECT ${metadata} FROM project_api_credentials WHERE user_id=$1 AND project_id=$2 ORDER BY created_at DESC,id`,[userId,projectId])).rows;}
 async revoke(userId:string,projectId:string,id:string){
  return transaction(this.pool,async client=>{const row=(await client.query('UPDATE project_api_credentials SET revoked_at=coalesce(revoked_at,now()) WHERE id=$1 AND user_id=$2 AND project_id=$3 RETURNING id,organization_id',[id,userId,projectId])).rows[0];if(!row)throw new Error('凭据不存在或不属于当前用户和项目');await client.query("INSERT INTO activity_logs(actor_id,organization_id,action,subject_id) VALUES($1,$2,'revoke-api-credential',$3)",[userId,row.organization_id,id]);return {id:row.id,revoked:true};});
 }
 async authenticate(token:string):Promise<ApiIdentity|undefined>{
  const matched=/^ia_([a-f0-9-]{36})_([A-Za-z0-9_-]{43})$/.exec(token);if(!matched)return undefined;
  return (await connection(this.pool).query(`SELECT u.id,u.username,u.display_name AS "displayName",u.platform_role AS "platformRole",u.enabled,k.project_id AS "projectId",k.id AS "credentialId",k.access AS "apiAccess" FROM project_api_credentials k JOIN users u ON u.id=k.user_id JOIN project_members p ON p.user_id=k.user_id AND p.project_id=k.project_id AND p.organization_id=k.organization_id JOIN organization_members o ON o.user_id=k.user_id AND o.organization_id=k.organization_id WHERE k.id=$1 AND k.token_hash=$2 AND k.revoked_at IS NULL AND k.expires_at>now() AND u.enabled AND (k.access='read' OR p.role IN('owner','analyst'))`,[matched[1],digest(token)])).rows[0];
 }
}
export function bearerToken(request:Request){return /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization')||'')?.[1]||'';}
