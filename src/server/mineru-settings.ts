import {existsSync,readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {z} from 'zod';
const schema=z.object({base:z.string().url().refine(value=>/^https?:\/\//.test(value)).transform(value=>value.replace(/\/+$/,'')),model:z.enum(['vlm','pipeline']),language:z.string().trim().min(1).max(30),apiKey:z.string().trim().max(10000).optional()}).strict();
const file=()=>resolve(process.env.PATENT_DATA_DIR||'data','mineru-config.json');
function cryptKey(){const value=process.env.PATENT_MODEL_CREDENTIAL_KEY||'';if(!/^[a-fA-F0-9]{64}$/.test(value))throw new Error('服务器尚未配置凭据加密密钥');return Buffer.from(value,'hex');}
function encrypt(text:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',cryptKey(),iv);const bytes=Buffer.concat([cipher.update(text,'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),bytes].map(part=>part.toString('base64')).join('.');}
function decrypt(text:string){const [iv,tag,bytes]=text.split('.').map(part=>Buffer.from(part,'base64'));const cipher=createDecipheriv('aes-256-gcm',cryptKey(),iv);cipher.setAuthTag(tag);return Buffer.concat([cipher.update(bytes),cipher.final()]).toString('utf8');}
export function mineruSettings(){const saved=existsSync(file())?JSON.parse(readFileSync(file(),'utf8')):undefined;return {base:saved?.base||process.env.PATENT_MINERU_BASE_URL||'https://mineru.net/api/v4',model:saved?.model||process.env.PATENT_MINERU_MODEL||'vlm',language:saved?.language||process.env.PATENT_MINERU_LANGUAGE||'ch',apiKey:saved?.encryptedKey?decrypt(saved.encryptedKey):process.env.PATENT_MINERU_API_KEY||''};}
export function publicMineruSettings(){const {apiKey,...settings}=mineruSettings();return {...settings,configured:Boolean(apiKey),source:existsSync(file())?'saved':'environment'};}
export function saveMineruSettings(value:unknown){const data=schema.parse(value),previous=mineruSettings(),apiKey=data.apiKey||previous.apiKey;if(!apiKey)throw new Error('首次配置须填写MinerU API Key');const path=file();mkdirSync(dirname(path),{recursive:true});writeFileSync(path+'.tmp',JSON.stringify({base:data.base,model:data.model,language:data.language,encryptedKey:encrypt(apiKey)})+'\n',{mode:0o600});renameSync(path+'.tmp',path);return publicMineruSettings();}
