import {setTimeout as delay} from 'node:timers/promises';

export type MineruCheckpoint={batchId:string;uploadUrl?:string;uploaded:boolean};
export type MineruResult={markdown?:string;content?:string;text?:string;full_zip_url?:string;state:string;err_msg?:string};
/** Uploaded batches survive cancellation and worker restart; terminal failures are cleared. */
export async function parseMineruCloud(bytes:Buffer,name:string,options:{signal?:AbortSignal;checkpoint?:MineruCheckpoint;save:(value:MineruCheckpoint|null)=>Promise<void>;fetch?:typeof fetch;pollMs?:number}):Promise<MineruResult>{
 const request=options.fetch||fetch,key=process.env.PATENT_MINERU_API_KEY;
 if(!key)throw new Error('尚未配置MinerU API凭据');
 const base=(process.env.PATENT_MINERU_BASE_URL||'https://mineru.net/api/v4').replace(/\/$/,''),headers={Authorization:'Bearer '+key,'Content-Type':'application/json'};
 const signal=AbortSignal.any([AbortSignal.timeout(30*60*1000),...(options.signal?[options.signal]:[])]);
 let saved=options.checkpoint;
 async function json(url:string,init:RequestInit={}){
  const response=await request(url,{...init,signal});if(!response.ok)throw new Error('MinerU请求失败：HTTP '+response.status);
  const value=await response.json();if(value.code!==0)throw new Error('MinerU请求失败：'+(value.msg||value.code));return value.data;
 }
 if(!saved){
  const data=await json(base+'/file-urls/batch',{method:'POST',headers,body:JSON.stringify({files:[{name}],model_version:process.env.PATENT_MINERU_MODEL||'vlm',is_ocr:true,enable_formula:true,enable_table:true,language:process.env.PATENT_MINERU_LANGUAGE||'ch'})});
  if(!data.batch_id||!data.file_urls?.[0])throw new Error('MinerU未返回上传批次');
  saved={batchId:data.batch_id,uploadUrl:data.file_urls[0],uploaded:false};await options.save(saved);
 }
 if(!saved.uploaded){
  if(!saved.uploadUrl)throw new Error('MinerU上传地址缺失');
  const response=await request(saved.uploadUrl,{method:'PUT',body:new Uint8Array(bytes),signal});
  if(!response.ok)throw new Error('MinerU上传失败：HTTP '+response.status);
  saved={batchId:saved.batchId,uploaded:true};await options.save(saved);
 }
 while(true){
  signal.throwIfAborted();
  const data=await json(base+'/extract-results/batch/'+encodeURIComponent(saved.batchId),{headers});
  const items=Array.isArray(data.extract_result)?data.extract_result:[data.extract_result];
  const result=items.find((item:MineruResult|undefined)=>item&&('state' in item));
  if(result?.state==='failed'){await options.save(null);throw new Error('MinerU解析失败：'+(result.err_msg||'未提供原因'));}
  if(result?.state==='done'){
   if(!result.markdown&&!result.content&&!result.text&&!result.full_zip_url)throw new Error('MinerU已完成但未提供解析结果');
   return result;
  }
  await delay(options.pollMs??3000,undefined,{signal});
 }
}
