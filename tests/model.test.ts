import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chat,readSSE} from '../src/server/model';
import {modelConfig} from '../src/server/config';
const stream=(text:string)=>new ReadableStream<Uint8Array>({start(controller){const bytes=new TextEncoder().encode(text);for(let i=0;i<bytes.length;i+=3)controller.enqueue(bytes.slice(i,i+3));controller.close();}});
test('chat does not impose output token limits for planning, extraction or streamed reports',async()=>{
 const original=globalThis.fetch;const config={...modelConfig(),key:'fixture',base:'https://example.com/v1'};
 try{
  const bodies:Record<string,unknown>[]=[];
  globalThis.fetch=async(_url,init)=>{const body=JSON.parse(String(init?.body));bodies.push(body);return body.stream?new Response(stream('data: {"choices":[{"delta":{"content":"完整报告"}}]}\n\ndata: [DONE]\n\n')):Response.json({choices:[{message:{content:'{"steps":[]}'},finish_reason:'stop'}]});};
  await chat('planning','question',{config,json:true});
  await chat('extraction','source',{config});
  await chat('report','results',{config,onDelta:()=>{}});
  for(const body of bodies){assert.equal(Object.hasOwn(body,'max_tokens'),false);assert.equal(Object.hasOwn(body,'max_completion_tokens'),false);}
  await chat('explicit','question',{config,maxTokens:100});assert.equal(bodies.at(-1)?.max_tokens,100);
 }finally{globalThis.fetch=original;}
});
test('SSE awaits asynchronous persistence before receiving the next chunk and surfaces write failures',async()=>{
 const received:string[]=[];
 await readSSE(stream('data: first\n\ndata: second\n\n'),async data=>{await new Promise(resolve=>setImmediate(resolve));received.push(data);});
 assert.deepEqual(received,['first','second']);
 await assert.rejects(readSSE(stream('data: failure\n\n'),async()=>{throw new Error('database write failed');}),/database write failed/);
});
test('SSE preserves split UTF-8 Chinese text and record boundaries',async()=>{const chunks:string[]=[];await readSSE(stream('data: {"text":"中文报告"}\n\ndata: [DONE]\n\n'),data=>chunks.push(data));assert.deepEqual(chunks,['{"text":"中文报告"}','[DONE]']);});
test('DashScope streaming requests usage and accepts final empty choices without changing custom providers',async()=>{
 const original=globalThis.fetch;
 try{
  let body:Record<string,unknown>={};globalThis.fetch=async(_url,init)=>{body=JSON.parse(String(init?.body));return new Response(stream('data: {"choices":[{"delta":{"content":"fixture"}}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\ndata: [DONE]\n\n'));};
  const config={...modelConfig(),key:'fixture',base:'https://dashscope.aliyuncs.com/compatible-mode/v1'};
  assert.equal(await chat('fixture','fixture',{config,onDelta:()=>{}}),'fixture');assert.deepEqual(body.stream_options,{include_usage:true});
  await chat('fixture','fixture',{config:{...config,base:'https://example.com/v1'},onDelta:()=>{}});assert.equal(body.stream_options,undefined);
 }finally{globalThis.fetch=original;}
});
test('actual stream termination is checked without scanning numbers or evidence objects',async()=>{const original=globalThis.fetch;process.env.DASHSCOPE_API_KEY||='unit-test-only';try{for(const [ending,valid] of [['data: [DONE]\n\n',true],['',false],['data: {"choices":[{"finish_reason":"length"}]}\n\ndata: [DONE]\n\n',false]] as const){globalThis.fetch=async()=>new Response(stream('data: {"choices":[{"delta":{"content":"申请人 05 的 0.4148 数据"}}]}\n\n'+ending));const chunks:string[]=[];const request=()=>chat('test','test',{onDelta:text=>chunks.push(text)});if(valid)assert.equal(await request(),'申请人 05 的 0.4148 数据');else await assert.rejects(request,/未完整结束/);assert.equal(chunks.join(''),'申请人 05 的 0.4148 数据');}}finally{globalThis.fetch=original;}});
