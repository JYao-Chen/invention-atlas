import {mkdirSync,writeFileSync,appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {questions} from '../src/lib/suggestions';
import type {Run,Params} from '../src/lib/types';
process.loadEnvFile('.env.local');
const base=process.env.VERIFY_BASE||'http://127.0.0.1:3018',out=resolve(process.env.VERIFY_OUT||'/home/yao/artifacts/invention-atlas/acceptance-20261009');
mkdirSync(out,{recursive:true});
let cookie='';
async function api(path:string,body?:unknown){const r=await fetch(base+'/api/'+path,{method:body?'POST':'GET',headers:{cookie,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});if(path==='login')cookie=(r.headers.get('set-cookie')||'').split(';')[0];const data=await r.json();if(!r.ok)throw Error(path+': '+data.error);return data;}
await api('login',{username:process.env.PATENT_USERNAME||'jyao',password:process.env.PATENT_PASSWORD});
const ds=await api('datasets'),datasetId=ds.active;const catalog=(await api('tools?dataset='+datasetId)).tools as {name:string;title:string;available:boolean;defaultParams:Params}[];
type Check={mode:string;tool:string;question:string;runId?:string;status:string;error?:string;results?:{tool:string;status:string;rows:number;summary:string}[];deltas?:number;milliseconds:number};
const checks:Check[]=[];
async function check(tool:typeof catalog[number],mode:'tool'|'recommendation'){
 const started=Date.now(),question=mode==='tool'?'直接工具验证：'+tool.title:questions[tool.name];let runId='';
 try{const c=await api('conversations',{datasetId});const r:Run=await api('runs',{conversationId:c.id,datasetId,question,...(mode==='tool'?{mode:'tool',steps:[{tool:tool.name,params:tool.defaultParams}]}:{})});runId=r.id;
  const response=await fetch(base+'/api/runs/'+r.id+'/events',{headers:{cookie},signal:AbortSignal.timeout(420000)});if(!response.ok||!response.body)throw Error('SSE unavailable');let deltas=0,buffer='';const reader=response.body.getReader(),decoder=new TextDecoder();while(true){const part=await reader.read();buffer+=decoder.decode(part.value||new Uint8Array(),{stream:!part.done});let end;while((end=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,end);buffer=buffer.slice(end+2);if(block.includes('event: text-delta'))deltas++;}if(part.done)break;}
  const final:Run=await api('runs/'+r.id);writeFileSync(resolve(out,mode+'-'+tool.name+'.json'),JSON.stringify(final,null,2));
  const matching=final.results.find(x=>x.tool===tool.name);const bad=final.results.filter(x=>x.status!=='completed');const status=final.status==='completed'&&matching&&matching.status==='completed'&&(!bad.length)&&(!final.error)&&(mode==='tool'||final.answer.trim()&&deltas>1)?'passed':'failed';
  const result:Check={mode,tool:tool.name,question,runId:r.id,status,error:final.error||bad.map(x=>x.tool+': '+x.summary).join('; ')||(!matching?'Required tool omitted':''),results:final.results.map(x=>({tool:x.tool,status:x.status,rows:x.rows.length,summary:x.summary})),deltas,milliseconds:Date.now()-started};checks.push(result);appendFileSync(resolve(out,'ledger.jsonl'),JSON.stringify(result)+'\n');console.log(JSON.stringify({mode,tool:tool.name,status,rows:matching?.rows.length,error:result.error,seconds:Math.round(result.milliseconds/1000)}));
 }catch(e){if(runId)await api('runs/'+runId+'/stop',{}).catch(()=>{});const result:Check={mode,tool:tool.name,question,runId,status:'failed',error:(e as Error).message,milliseconds:Date.now()-started};checks.push(result);appendFileSync(resolve(out,'ledger.jsonl'),JSON.stringify(result)+'\n');console.log(JSON.stringify(result));}
}
const filter=(process.env.VERIFY_TOOLS||'').split(',').filter(Boolean),selected=catalog.filter(t=>!filter.length||filter.includes(t.name));
const modes=(process.env.VERIFY_MODES||'tool,recommendation').split(',') as ('tool'|'recommendation')[];
for(const mode of modes){let index=0;await Promise.all(Array.from({length:3},async()=>{while(index<selected.length){const tool=selected[index++];await check(tool,mode);}}));}
const summary={datasetId,recordCount:ds.datasets.find((d:{id:string})=>d.id===datasetId)?.count,total:checks.length,passed:checks.filter(x=>x.status==='passed').length,failed:checks.filter(x=>x.status!=='passed'),checks};writeFileSync(resolve(out,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify({total:summary.total,passed:summary.passed,failed:summary.failed.length}));process.exitCode=summary.failed.length?1:0;
