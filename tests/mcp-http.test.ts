import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {openApiDocument} from '../src/server/openapi';
test('HTTP MCP keeps concurrent project credentials separate and rechecks revocation on each request',async()=>{
 const enabled=new Set(['project-a','project-b']);
 const api=createServer((request,response)=>{
  response.setHeader('content-type','application/json');const token=request.headers.authorization?.replace('Bearer ','')||'';
  if(!enabled.has(token)){response.statusCode=401;response.end(JSON.stringify({error:'凭据已撤销'}));return;}
  if(request.url==='/api/openapi'){response.end(JSON.stringify(openApiDocument()));return;}
  if(request.url==='/api/datasets'){response.end(JSON.stringify({datasets:[{id:token}],active:token}));return;}
  response.statusCode=404;response.end(JSON.stringify({error:'接口不存在'}));
 });
 await new Promise<void>(resolve=>api.listen(0,'127.0.0.1',resolve));const apiPort=(api.address() as {port:number}).port;
 const probe=createServer();await new Promise<void>(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=(probe.address() as {port:number}).port;await new Promise<void>(resolve=>probe.close(()=>resolve()));
 const child=spawn(process.execPath,['scripts/patent-mcp-http.mjs'],{cwd:process.cwd(),env:{NODE_ENV:'test',ATLAS_API_URL:'http://127.0.0.1:'+apiPort+'/api/',ATLAS_MCP_PORT:String(port)},stdio:['ignore','pipe','pipe']});let log='';const clients:Client[]=[];
 try{
  await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('HTTP MCP未就绪: '+log)),10000);child.stderr.on('data',chunk=>{log+=chunk;if(log.includes('HTTP ready')){clearTimeout(timer);resolve();}});child.once('exit',code=>{clearTimeout(timer);reject(new Error('HTTP MCP退出 '+code+': '+log));});});
  const url='http://127.0.0.1:'+port+'/mcp';assert.equal((await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,401);
  for(const token of ['project-a','project-b']){const client=new Client({name:token,version:'0.1.0'});clients.push(client);await client.connect(new StreamableHTTPClientTransport(new URL(url),{requestInit:{headers:{authorization:'Bearer '+token}}}));}
  const results=await Promise.all(Array.from({length:12},async(_,index)=>{const selected=index%2;const result=await clients[selected].callTool({name:'atlas_list_datasets',arguments:{}});return {selected,data:result.structuredContent as {active:string}};}));
  for(const result of results)assert.equal(result.data.active,result.selected?'project-b':'project-a');
  assert.equal((await fetch(url,{method:'POST',headers:{authorization:'Bearer project-a',origin:'https://unapproved.example','content-type':'application/json'},body:'{}'})).status,403);
  enabled.delete('project-a');await assert.rejects(clients[0].callTool({name:'atlas_list_datasets',arguments:{}}));const remaining=await clients[1].callTool({name:'atlas_list_datasets',arguments:{}});assert.equal((remaining.structuredContent as {active:string}).active,'project-b');
 }finally{await Promise.all(clients.map(client=>client.close()));if(child.exitCode===null){const stopped=new Promise<void>(resolve=>child.once('exit',()=>resolve()));child.kill('SIGTERM');await stopped;}await new Promise<void>(resolve=>api.close(()=>resolve()));}
});
