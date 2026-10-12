import {modelConfig} from './config';
import {providerTokens,recordModelUsage} from './model-usage';
import {reserveModelCall} from './model-budget';
export async function readSSE(body:ReadableStream<Uint8Array>,receive:(data:string)=>unknown){const reader=body.getReader(),decoder=new TextDecoder();let buffer='';try{while(true){const part=await reader.read();buffer+=decoder.decode(part.value||new Uint8Array(),{stream:!part.done});let end;while((end=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,end);buffer=buffer.slice(end+2);const data=block.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');if(data)await receive(data);}if(part.done)break;}}finally{reader.releaseLock();}}
export async function chat(system:string,user:string,options:{signal?:AbortSignal;onDelta?:(text:string)=>unknown;json?:boolean;config?:ReturnType<typeof modelConfig>;maxTokens?:number}={}){
 const cfg=options.config||modelConfig();if(!cfg.key)throw new Error('请先配置模型 API Key');
 options.signal?.throwIfAborted();await reserveModelCall();
 const started=Date.now();let usage:unknown,status:'completed'|'failed'|'cancelled'='failed';
 try{
 const response=await fetch(cfg.base+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+cfg.key,'Content-Type':'application/json'},body:JSON.stringify({model:cfg.model,messages:[{role:'system',content:system},{role:'user',content:user}],temperature:0.1,...(cfg.base.includes('dashscope.aliyuncs.com')?{enable_thinking:false,...(options.onDelta?{stream_options:{include_usage:true}}:{})}:{}),max_tokens:options.maxTokens||(options.json?4000:6000),stream:Boolean(options.onDelta),...(options.json?{response_format:{type:'json_object'}}:{})}),signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(180000)]):AbortSignal.timeout(180000)});
 if(!response.ok)throw new Error('模型调用失败（HTTP '+response.status+'）');
 if(options.onDelta){if(!response.body)throw new Error('模型未返回数据流');let answer='',done=false,truncated=false;await readSSE(response.body,async data=>{if(data==='[DONE]'){done=true;return;}const part=JSON.parse(data);if(part.usage)usage=part.usage;if(part.error)throw new Error('模型数据流中断');if(part.choices?.[0]?.finish_reason==='length')truncated=true;const delta=part.choices?.[0]?.delta?.content;if(typeof delta==='string'){answer+=delta;await options.onDelta?.(delta);}});if(truncated)throw new Error('报告达到输出长度上限，数据流未完整结束；已保留工具结果，可仅重试报告');if(!done)throw new Error('报告数据流未完整结束，已保留工具结果，可仅重试报告');if(!answer.trim())throw new Error('模型未返回报告内容');status='completed';return answer;}
 const payload=await response.json();usage=payload.usage;if(payload.choices?.[0]?.finish_reason==='length')throw new Error('模型输出超过长度限制，内容不完整');const content=payload.choices?.[0]?.message?.content;if(typeof content!=='string'||!content.trim())throw new Error('模型未返回内容');status='completed';return content;
 }catch(error){if(options.signal?.aborted)status='cancelled';throw error;}finally{
 try{await recordModelUsage({kind:'chat',model:cfg.model,provider:cfg.base,status,...providerTokens(usage),durationMs:Date.now()-started});}catch{console.warn('模型用量保存失败；本次调用结果保持不变');}
 }
}
export async function embed(inputs:string[],signal?:AbortSignal):Promise<number[][]>{
 const cfg=modelConfig();if(!cfg.embeddingKey)throw new Error('尚未配置百炼嵌入模型');
 signal?.throwIfAborted();await reserveModelCall();
 const started=Date.now();let usage:unknown,status:'completed'|'failed'|'cancelled'='failed';
 try{
  const r=await fetch(cfg.embeddingBase+'/embeddings',{method:'POST',headers:{Authorization:'Bearer '+cfg.embeddingKey,'Content-Type':'application/json'},body:JSON.stringify({model:cfg.embedding,input:inputs.map(x=>x.slice(0,7000)),dimensions:1024,encoding_format:'float'}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(90000)]):AbortSignal.timeout(90000)});
  if(!r.ok)throw new Error('嵌入调用失败（HTTP '+r.status+'）');
  const data=await r.json();usage=data.usage;
  const rows=data.data?.sort((a:{index:number},b:{index:number})=>a.index-b.index);
  if(rows?.length!==inputs.length||rows.some((x:{embedding:number[]})=>x.embedding.length!==1024||x.embedding.some(v=>!Number.isFinite(v))))throw new Error('嵌入维度或数量不符');
  status='completed';return rows.map((x:{embedding:number[]})=>x.embedding);
 }catch(error){if(signal?.aborted)status='cancelled';throw error;}finally{
  try{await recordModelUsage({kind:'embedding',model:cfg.embedding,provider:cfg.embeddingBase,status,...providerTokens(usage),durationMs:Date.now()-started});}catch{console.warn('模型用量保存失败；本次调用结果保持不变');}
 }
}
export function jsonResponse<T>(text:string):T{return JSON.parse(text.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));}
