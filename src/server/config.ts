import {existsSync,readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {z} from 'zod';
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
const defaultBase='https://dashscope.aliyuncs.com/compatible-mode/v1';
const settingsSchema=z.object({model:z.string().trim().min(1,'请填写模型名称'),base:z.string().trim().url('请填写完整接口地址').refine(value=>/^https?:\/\//.test(value),'接口地址必须使用 HTTP 或 HTTPS').transform(value=>value.replace(/\/+$/,'')),apiKey:z.string().trim().optional()}).strict();
type SavedSettings={model:string;base:string;apiKey?:string};
function parseSettings(input:unknown){const parsed=settingsSchema.safeParse(input);if(!parsed.success)throw new Error(parsed.error.issues[0].message);return parsed.data;}
const settingsPath=()=>resolve(process.env.PATENT_DATA_DIR||'data','model-config.json');
function savedSettings():Partial<SavedSettings>{const path=settingsPath();return existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{};}
export function modelConfig(){const saved=savedSettings();return {model:saved.model||process.env.PATENT_MODEL||'qwen3.8-flash',embedding:process.env.PATENT_EMBEDDING_MODEL||'text-embedding-v4',key:saved.apiKey||process.env.DASHSCOPE_API_KEY||'',base:saved.base||process.env.PATENT_API_BASE_URL||defaultBase,embeddingBase:defaultBase,embeddingKey:process.env.DASHSCOPE_API_KEY||''};}
export function resolveModelSettings(input:unknown){const cfg=modelConfig();const parsed=parseSettings(input);return {...cfg,model:parsed.model,base:parsed.base,key:parsed.apiKey||cfg.key};}
export function saveModelSettings(input:unknown){const parsed=parseSettings(input),previous=savedSettings();const next:SavedSettings={model:parsed.model,base:parsed.base,...(parsed.apiKey?{apiKey:parsed.apiKey}:previous.apiKey?{apiKey:previous.apiKey}:{})};const path=settingsPath();mkdirSync(dirname(path),{recursive:true});writeFileSync(path+'.tmp',JSON.stringify(next,null,2)+'\n',{mode:0o600});renameSync(path+'.tmp',path);return modelConfig();}
export function publicModelSettings(){const cfg=modelConfig();return {model:cfg.model,base:cfg.base,embedding:cfg.embedding,embeddingBase:cfg.embeddingBase,configured:Boolean(cfg.key),dimensions:1024,username:process.env.PATENT_USERNAME||'jyao'};}
