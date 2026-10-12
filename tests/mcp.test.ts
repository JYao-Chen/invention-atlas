import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {openApiDocument} from '../src/server/openapi';
import {TOOL_DEFS} from '../src/server/tools';

test('official MCP client discovers real tool schemas, calls HTTP with project credentials and surfaces revocation',async()=>{
 let enabled=true,calls=0,toolRequests=0;
 let slowStarted!:()=>void,slowClosed!:()=>void;const started=new Promise<void>(resolve=>slowStarted=resolve),closed=new Promise<void>(resolve=>slowClosed=resolve);
 const http=createServer(async(request,response)=>{
  response.setHeader('content-type','application/json');
  assert.equal(request.headers.authorization,'Bearer synthetic-project-key');
  if(!enabled){response.statusCode=401;response.end(JSON.stringify({error:'凭据已撤销'}));return;}
  if(request.url==='/api/openapi'){response.end(JSON.stringify(openApiDocument()));return;}
  if(request.url==='/api/runs/slow'){response.on('close',slowClosed);slowStarted();return;}
  if(request.url?.startsWith('/api/tools/'))toolRequests++;
  if(request.url==='/api/tools/get_dataset_summary'){
   let body='';for await(const chunk of request)body+=chunk;const args=JSON.parse(body);assert.equal(args.datasetId,'project-dataset');calls++;response.end(JSON.stringify({id:'computed-result',datasetId:args.datasetId,status:'completed',rows:[{records:3000}],rowSources:[],warnings:[]}));return;
  }
  if(request.url?.startsWith('/api/results/')){response.end(JSON.stringify({id:'computed-result',total:3000,rows:[{patent:'US1'}],nextOffset:1}));return;}
  response.statusCode=404;response.end(JSON.stringify({error:'接口不存在'}));
 });
 await new Promise<void>(resolve=>http.listen(0,'127.0.0.1',resolve));const address=http.address() as {port:number};
 const transport=new StdioClientTransport({command:process.execPath,args:['scripts/patent-mcp.mjs'],cwd:process.cwd(),env:{ATLAS_API_URL:'http://127.0.0.1:'+address.port+'/api/',ATLAS_API_TOKEN:'synthetic-project-key'},stderr:'pipe'});
 let errors='';transport.stderr?.on('data',chunk=>errors+=chunk);
 const client=new Client({name:'patent-platform-test',version:'0.1.0'});
 try{
  await client.connect(transport);const listing=await client.listTools();assert.equal(listing.tools.length,TOOL_DEFS.length+7);assert.ok(listing.tools.some(tool=>tool.name==='atlas_submit_analysis'));
  const result=await client.callTool({name:'get_dataset_summary',arguments:{datasetId:'project-dataset',params:{},semantic:false}});assert.equal(result.isError,undefined);assert.equal((result.structuredContent as {rows:{records:number}[]}).rows[0].records,3000);assert.equal(calls,1);
  const invalid=await client.callTool({name:'search_patents',arguments:{datasetId:'project-dataset',params:{}}});assert.equal(invalid.isError,true);assert.match(JSON.stringify(invalid.content),/query/);assert.equal(calls,1);assert.equal(toolRequests,1);
  const page=await client.callTool({name:'atlas_read_result',arguments:{resultId:'computed-result',limit:1}});assert.equal((page.structuredContent as {nextOffset:number}).nextOffset,1);
  const controller=new AbortController(),pending=client.callTool({name:'atlas_read_run',arguments:{runId:'slow'}},{signal:controller.signal});const rejection=assert.rejects(pending);await started;controller.abort();await rejection;await Promise.race([closed,new Promise<never>((_resolve,reject)=>setTimeout(()=>reject(new Error('MCP取消未终止HTTP读取')),2000))]);
  enabled=false;const revoked=await client.callTool({name:'get_dataset_summary',arguments:{datasetId:'project-dataset',params:{}}});assert.equal(revoked.isError,true);assert.match(JSON.stringify(revoked.content),/401.*凭据已撤销/);assert.equal(calls,1);
  assert.equal(errors,'');
 }finally{await client.close();await new Promise<void>(resolve=>http.close(()=>resolve()));}
});
