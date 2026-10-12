import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import type {Pool} from 'pg';
import {z} from 'zod';
import {connection,currentAccess} from './postgres';
import {IdentityStore} from './identity';
import {withModelSettings} from './config';
const input=z.object({model:z.string().trim().min(1).max(200),base:z.string().url().refine(value=>/^https?:\/\//.test(value)).transform(value=>value.replace(/\/+$/,'')),apiKey:z.string().trim().min(1).max(10000).optional()}).strict();
function key(){const value=process.env.PATENT_MODEL_CREDENTIAL_KEY||'';if(!/^[a-fA-F0-9]{64}$/.test(value))throw new Error('服务器尚未配置组织模型凭据加密密钥');return Buffer.from(value,'hex');}
function encrypt(value:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv),bytes=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),bytes].map(part=>part.toString('base64')).join('.');}
function decrypt(value:string){const [iv,tag,bytes]=value.split('.').map(part=>Buffer.from(part,'base64'));const cipher=createDecipheriv('aes-256-gcm',key(),iv);cipher.setAuthTag(tag);return Buffer.concat([cipher.update(bytes),cipher.final()]).toString('utf8');}
export class OrganizationModel{
 constructor(private readonly pool:Pool){}
 private scope(){const scope=currentAccess();if(!scope?.organizationId)throw new Error('请先选择组织项目');return scope;}
 async read(){const scope=this.scope();return (await connection(this.pool).query('SELECT model,base,updated_at FROM organization_models WHERE organization_id=$1',[scope.organizationId])).rows[0]||null;}
 async runtime(){const scope=this.scope();const row=(await connection(this.pool).query('SELECT model,base,encrypted_key FROM organization_models WHERE organization_id=$1',[scope.organizationId])).rows[0];return row?{model:row.model,base:row.base,apiKey:decrypt(row.encrypted_key)}:undefined;}
 private async admin(){const scope=this.scope();if(await new IdentityStore(this.pool).organizationRole(scope.userId,scope.organizationId)!=='admin')throw new Error('需要本组织管理员权限');return scope;}
 async save(value:unknown){const scope=await this.admin(),data=input.parse(value),previous=(await connection(this.pool).query('SELECT encrypted_key FROM organization_models WHERE organization_id=$1',[scope.organizationId])).rows[0];if(!data.apiKey&&!previous)throw new Error('首次配置须填写API Key');const encrypted=data.apiKey?encrypt(data.apiKey):previous.encrypted_key;await connection(this.pool).query('INSERT INTO organization_models(organization_id,model,base,encrypted_key,updated_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(organization_id) DO UPDATE SET model=excluded.model,base=excluded.base,encrypted_key=excluded.encrypted_key,updated_by=excluded.updated_by,updated_at=now()',[scope.organizationId,data.model,data.base,encrypted,scope.userId]);return this.read();}
 async remove(){const scope=await this.admin();await connection(this.pool).query('DELETE FROM organization_models WHERE organization_id=$1',[scope.organizationId]);}
}
export async function withOrganizationModel<T>(pool:Pool,work:()=>Promise<T>){if(!currentAccess()?.organizationId)return work();return withModelSettings(await new OrganizationModel(pool).runtime(),work);}
