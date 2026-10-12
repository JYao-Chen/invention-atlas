import {McpServer,fromJsonSchema} from '@modelcontextprotocol/server';
export async function createPatentMcpServer({url,token,spec:providedSpec}){
const base=new URL(url);
if(!['http:','https:'].includes(base.protocol))throw new Error('ATLAS_API_URL必须为HTTP或HTTPS接口地址');
if(!base.pathname.endsWith('/'))base.pathname+='/';
if(!token)throw new Error('请提供项目接口凭据');
async function api(path,method='GET',body,signal){
 const response=await fetch(new URL(path,base),{method,headers:{authorization:'Bearer '+token,...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal});
 const data=await response.json();if(!response.ok)throw new Error('HTTP '+response.status+': '+(data.error||'接口调用失败'));return data;
}
const spec=providedSpec||await api('openapi');
const server=new McpServer({name:'invention-atlas',version:'0.1.0'},{instructions:'所有工具仅访问凭据绑定的项目。统计基于指定数据集，不代表全球专利全集。unavailable表示数据或索引不足，不是零值。分析工具可能产生模型费用；长任务使用atlas_submit_analysis并通过atlas_read_run读取进度。结果字段定义与原文关联在contract和rowSources中；不截断结果冒充完整统计。'});
function register(name,title,description,schema,invoke,readOnly=false){
 server.registerTool(name,{title,description,inputSchema:fromJsonSchema(schema),annotations:{readOnlyHint:readOnly,destructiveHint:false,idempotentHint:readOnly,openWorldHint:false}},async(args,ctx)=>{
  try{const data=await invoke(args,ctx.mcpReq.signal);return {content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data};}
  catch(error){return {isError:true,content:[{type:'text',text:error.message||'工具执行失败'}]};}
 });
}
for(const [path,operations] of Object.entries(spec.paths)){
 if(!path.startsWith('/tools/'))continue;
 const operation=operations.post;if(!operation)continue;
 register(operation.operationId,operation.summary,operation.description,operation.requestBody.content['application/json'].schema,(args,signal)=>api(path.slice(1),'POST',args,signal));
}
const object=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
const id={type:'string',minLength:1};
register('atlas_list_datasets','项目数据集','读取当前凭据项目的数据集和活动数据集编号。',object({}),(_args,signal)=>api('datasets','GET',undefined,signal),true);
register('atlas_tool_capabilities','工具可用性','读取指定数据集的工具默认参数、所需字段、实际可用性和不足原因。',object({datasetId:id}),({datasetId},signal)=>api('tools'+(datasetId?'?dataset='+encodeURIComponent(datasetId):''),'GET',undefined,signal),true);
register('atlas_read_result','完整结果分页','读取已保存结果，每页最多200行；遵循nextOffset读取后续行，不把当前页当作全部结果。section=nodes或graph读取图结构。',object({resultId:id,offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:200},word:{type:'string'},year:{type:'string'},section:{type:'string',enum:['nodes','graph']}},['resultId']),({resultId,...params},signal)=>api('results/'+encodeURIComponent(resultId)+'?'+new URLSearchParams(Object.entries(params).map(([key,value])=>[key,String(value)])),'GET',undefined,signal),true);
register('atlas_create_conversation','创建分析对话','在指定数据集创建对话，需要读写凭据。返回对话编号，用于持久分析任务。',object({datasetId:id,title:{type:'string'}},['datasetId']),(args,signal)=>api('conversations','POST',args,signal));
register('atlas_submit_analysis','提交持久分析','使用现有对话和相同数据集提交自然语言分析，返回运行编号。任务入队后由独立worker执行，不依赖MCP进程保持连接。提交可能产生模型费用；不要因客户端等待超时重复提交。',spec.paths['/runs'].post.requestBody.content['application/json'].schema,(args,signal)=>api('runs','POST',args,signal));
register('atlas_read_run','读取分析进度','读取运行状态、阶段产物、已保存正文及工具结果。running表示尚未完成；completed/partial/failed/cancelled/interrupted为终态。',object({runId:id},['runId']),({runId},signal)=>api('runs/'+encodeURIComponent(runId),'GET',undefined,signal),true);
register('atlas_stop_run','停止分析','停止指定运行，需要读写凭据。已保存的工具结果仍保留。',object({runId:id},['runId']),({runId},signal)=>api('runs/'+encodeURIComponent(runId)+'/stop','POST',{},signal));
return server;
}
