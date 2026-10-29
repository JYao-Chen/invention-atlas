import {createHash,randomUUID} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {mkdir,readFile,rename,rm,stat,readdir,writeFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createGunzip} from 'node:zlib';
import {Parse} from 'unzipper';
import {once} from 'node:events';
import {createInterface} from 'node:readline';
import {Pool} from 'pg';
import {migratePostgres,transaction} from '../../src/server/postgres';
import {upsertExternal,type ExternalTable} from '../../src/server/external/store';
import {patentNumber,NumberNormalizer} from '../../src/server/external/patent-number';
export type Options={dryRun:boolean;limit?:number;output:string;seeds?:string;fixtureDir?:string;schema?:string};
export function options(args=process.argv.slice(2)):Options{
 const result:Options={dryRun:false,output:'data/external'};
 for(let i=0;i<args.length;i++){
  const a=args[i];if(a==='--dry-run'){result.dryRun=true;continue;}
  if(!['--limit','--output','--seeds','--fixture-dir','--schema'].includes(a)||!args[i+1])throw new Error('Unknown or incomplete option: '+a);
  const value=args[++i];if(a==='--limit'){result.limit=Number(value);if(!Number.isSafeInteger(result.limit)||result.limit<1)throw new Error('--limit must be a positive integer');}
  else if(a==='--output')result.output=value;else if(a==='--seeds')result.seeds=value;else if(a==='--fixture-dir')result.fixtureDir=value;else result.schema=value;
 }
 const path=relative(process.cwd(),resolve(result.output));if(path.startsWith('..')||isAbsolute(path))throw new Error('--output must be within this worktree');
 return result;
}
export async function jsonRequest(url:string,headers:Record<string,string>={}){
 const response=await fetch(url,{headers:{'User-Agent':'invention-atlas-external/1.0',...headers},signal:AbortSignal.timeout(60000)});
 if(!response.ok)throw new Error('HTTP '+response.status+' from '+new URL(url).hostname);
 return response.json();
}
export type RemoteFile={name:string;url:string;size:number|null;updated:string|null;released?:string;dataFrom?:string;dataTo?:string};
export type Discovery={source:string;version:string;url:string;license:string;files:RemoteFile[];blocked?:string};
export async function discover(source:'patentsview'|'maintenance'|'science'|'openalex',o:Options):Promise<Discovery>{
 if(o.fixtureDir){const catalog=JSON.parse(await readFile(resolve(o.fixtureDir,'catalog.json'),'utf8'));return catalog[source];}
 if(source==='openalex')return {source,version:'api-v1',url:'https://api.openalex.org/works',license:'CC0',files:[]};
 if(source==='science'){
  const d=await jsonRequest('https://zenodo.org/api/records/5080077/versions/latest');
  const file=d.files.find((f:any)=>f.key==='pcs_oa_uspto.csv');if(!file)throw new Error('Zenodo latest record lacks pcs_oa_uspto.csv');
  const license=d.metadata.license?.id;if(license!=='cc-by-nc-4.0')throw new Error('Zenodo license changed; review before ingestion');
  return {source,version:String(d.id),url:d.links.self_html,license:'CC BY-NC 4.0',files:[{name:file.key,url:file.links.self,size:file.size,updated:d.updated}]};
 }
 const product=source==='patentsview'?'PVGPATDIS':'ptmnfee2',url='https://api.uspto.gov/api/v1/datasets/products/'+product;
 const base={source,version:'unresolved',url,license:'USPTO public data (source terms apply)',files:[]};
 if(!process.env.USPTO_ODP_API_KEY)return {...base,blocked:'USPTO_ODP_API_KEY required; unauthenticated ODP product/file endpoints return 401. Obtain an ODP key at https://data.uspto.gov/apis/getting-started'};
 const headers={'X-API-KEY':process.env.USPTO_ODP_API_KEY};
 const files:RemoteFile[]=[];let offset=0,total:number|undefined;
 do{
  const pageUrl=offset?url+'?includeFiles=true&limit=1000&offset='+offset:url;
  const data=await jsonRequest(pageUrl,headers),productData=data.bulkDataProductBag?.[0];
  const bag=productData?.productFileBag?.fileDataBag;
  if(!Array.isArray(bag)||!Number.isSafeInteger(productData.productFileTotalQuantity))throw new Error('ODP product metadata schema unrecognized; review authenticated response');
  total=productData.productFileTotalQuantity;
  const page:RemoteFile[]=bag.map((f:any)=>({name:f.fileName,url:f.fileDownloadURI,size:f.fileSize,updated:f.fileLastModifiedDateTime??f.fileReleaseDate,released:f.fileReleaseDate,dataFrom:f.fileDataFromDate,dataTo:f.fileDataToDate}));
  if(page.some(f=>!f.name||!f.url||!Number.isFinite(f.size)||!f.updated))throw new Error('ODP metadata missing file name/URI/size/update date');
  const existing=new Set(files.map(f=>f.name));files.push(...page.filter(f=>!existing.has(f.name)));
  if(files.length===offset&&files.length<total!)throw new Error('ODP file pagination did not advance; review catalogue response');
  offset=files.length;
 }while(offset<total!);
 if(!files.length)throw new Error('ODP product has no files');
 const dates=files.map(f=>f.updated!).sort();
 return {...base,version:dates.at(-1)!.replace(/[^a-zA-Z0-9._-]/g,'_'),files};
}
export async function* download(file:RemoteFile,fixtureDir?:string,member?:RegExp):AsyncGenerator<Buffer>{
 let raw:Readable;
 if(fixtureDir)raw=createReadStream(resolve(fixtureDir,file.name));
 else{
  const host=new URL(file.url).hostname,headers:Record<string,string>={};
  if(host==='api.uspto.gov'&&process.env.USPTO_ODP_API_KEY)headers['X-API-KEY']=process.env.USPTO_ODP_API_KEY;
  const r=await fetch(file.url,{headers:{'User-Agent':'invention-atlas-external/1.0',...headers},signal:AbortSignal.timeout(24*3600*1000)});if(!r.ok||!r.body)throw new Error('Download HTTP '+r.status+' from '+host);
  raw=Readable.fromWeb(r.body as any);
 }
 if(file.name.endsWith('.zip')){
  const archive=Parse({forceStream:true}),feeding=pipeline(raw,archive).then(()=>null,error=>error as Error);let selected=0;
  try{
   for await(const entry of archive){
    if(entry.type==='File'&&(member?member.test(entry.path):/\.tsv$/i.test(entry.path))){
     if(++selected>1)throw new Error('ZIP contains multiple matching data members');
     for await(const chunk of entry)yield Buffer.from(chunk);
    }else await entry.autodrain().promise();
   }
   const failure=await feeding;if(failure)throw failure;if(selected!==1)throw new Error('ZIP has no matching data member');
  }finally{raw.destroy();archive.destroy();}
  return;
 }
 const gzip=file.name.endsWith('.gz')?createGunzip():undefined,decoded=gzip??raw;
 const feeding=gzip?pipeline(raw,gzip).then(()=>null,error=>error as Error):undefined;
 try{for await(const chunk of decoded)yield Buffer.from(chunk);const failure=await feeding;if(failure)throw failure;}
 finally{raw.destroy();decoded.destroy();}
}
export type Action={table:ExternalTable;row:Record<string,unknown>};
export type FileResult={file:string;sha256:string;rows:number;bytes:number};
export type Manifest={id:string;source:string;version:string;url:string;license:string;seeds:string[];subsetRule:string;startedAt:string;finishedAt?:string;elapsedMs?:number;status:'running'|'complete'|'blocked';reason?:string;unrecognized:number;requests:number;inputs?:string[];missingWorks?:string[];files:Record<string,FileResult>;discovery:Discovery};
async function diskUsage(dir:string):Promise<number>{let bytes=0;try{for(const item of await readdir(dir,{withFileTypes:true})){const p=resolve(dir,item.name);bytes+=item.isDirectory()?await diskUsage(p):(await stat(p)).size;}}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}return bytes;}
export async function saveReport(root:string,path:string,value:unknown){
 const content=JSON.stringify(value,null,2)+'\n';
 if(await diskUsage(resolve(root))+Buffer.byteLength(content)>3_000_000_000)throw new Error('Subset storage including manifests exceeds 3 GB');
 await writeFile(path+'.tmp',content);await rename(path+'.tmp',path);
}
export class Build{
 readonly normalizer=new NumberNormalizer();
 private constructor(readonly pool:Pool,readonly opts:Options,readonly dir:string,readonly manifest:Manifest,private used:number){}
 static async open(pool:Pool,opts:Options,d:Discovery,seeds:string[],subsetRule:string){
  if(!/^[a-zA-Z0-9._-]+$/.test(d.version))throw new Error('Invalid source version');
  const dir=resolve(opts.output,d.source,d.version);await mkdir(dir,{recursive:true});
  let manifest:Manifest;
  try{manifest=JSON.parse(await readFile(resolve(dir,'manifest.json'),'utf8'));if(JSON.stringify(manifest.seeds)!==JSON.stringify(seeds))throw new Error('Seed set changed; select a separate --output directory');}
  catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;manifest={id:randomUUID(),source:d.source,version:d.version,url:d.url,license:d.license,seeds,subsetRule,startedAt:new Date().toISOString(),status:'running',unrecognized:0,requests:0,files:{},discovery:d};}
  const build=new Build(pool,opts,dir,manifest,await diskUsage(resolve(opts.output)));await build.save();await build.source();return build;
 }
 async inputs(ids:string[]){if(this.manifest.inputs&&JSON.stringify(this.manifest.inputs)!==JSON.stringify(ids))throw new Error('Upstream subset changed; choose a new --output directory');this.manifest.inputs=ids;await this.save();}
 async save(){await saveReport(this.opts.output,resolve(this.dir,'manifest.json'),this.manifest);this.used=await diskUsage(resolve(this.opts.output));}
 async source(){const m=this.manifest,files=Object.values(m.files);await upsertExternal(this.pool,'external_sources',[{id:m.id,name:m.source,version:m.version,url:m.url,license:m.license,retrieved_at:m.finishedAt??m.startedAt,sha256:files.length?createHash('sha256').update(files.map(f=>f.sha256).join('\n')).digest('hex'):null,row_count:files.reduce((n,f)=>n+f.rows,0),bytes:files.reduce((n,f)=>n+f.bytes,0),subset_rule:m.subsetRule,notes:{missingWorks:m.missingWorks??[],status:m.status,reason:m.reason??null,unrecognized:m.unrecognized,requests:m.requests,files:m.files,discovery:m.discovery}}]);}
 async stage(name:string,produce:()=>AsyncIterable<Action>,observe?:(action:Action)=>void){
  const filename=name+'.jsonl',path=resolve(this.dir,filename),existing=this.manifest.files[name];
  const replay=async()=>{
   const hash=createHash('sha256');let bytes=0,rows=0;
   async function* actions(){for await(const line of createInterface({input:createReadStream(path),crlfDelay:Infinity})){hash.update(line+'\n');bytes+=Buffer.byteLength(line+'\n');rows++;yield JSON.parse(line) as Action;}}
   await this.apply(actions(),observe);if(hash.digest('hex')!==existing.sha256||bytes!==existing.bytes||rows!==existing.rows)throw new Error('Cached subset checksum/count mismatch: '+filename);
  };
  if(existing){await transaction(this.pool,replay);return;}
  const tmp=path+'.part';await rm(tmp,{force:true});this.used=await diskUsage(resolve(this.opts.output));const out=createWriteStream(tmp);let rows=0,bytes=0;const hash=createHash('sha256');
  const generated=async function*(self:Build){for await(const action of produce()){
   action.row.source_id=self.manifest.id;const line=JSON.stringify(action)+'\n',size=Buffer.byteLength(line);
   if(self.used+size>3_000_000_000)throw new Error('Subset storage exceeds 3 GB; stopping');
   self.used+=size;bytes+=size;rows++;hash.update(line);if(!out.write(line))await once(out,'drain');yield action;
  }};
  try{await this.apply(generated(this),observe);out.end();await once(out,'finish');await rename(tmp,path);this.manifest.files[name]={file:filename,sha256:hash.digest('hex'),rows,bytes};this.manifest.unrecognized+=this.normalizer.unrecognized;this.normalizer.unrecognized=0;await this.save();await this.source();}
  catch(e){out.destroy();await rm(tmp,{force:true});throw e;}
 }
 private async apply(actions:AsyncIterable<Action>,observe?:(a:Action)=>void){
  let batch:Record<string,unknown>[]=[],table:ExternalTable|undefined;
  const flush=async()=>{if(table&&batch.length)await upsertExternal(this.pool,table,batch);batch=[];};
  for await(const action of actions){if(action.table!==table){await flush();table=action.table;}observe?.(action);batch.push(action.row);if(batch.length>=100)await flush();}await flush();
 }
 async finish(purposes:Record<string,string[]>){
  for(const [purpose,seeds]of Object.entries(purposes))await upsertExternal(this.pool,'external_source_seeds',seeds.map(patent_number=>({source_id:this.manifest.id,patent_number,purpose})));
  this.manifest.status='complete';delete this.manifest.reason;this.manifest.finishedAt=new Date().toISOString();this.manifest.elapsedMs=Date.now()-Date.parse(this.manifest.startedAt);await this.save();await this.source();
 }
 async blocked(reason:string){this.manifest.status='blocked';this.manifest.reason=reason;this.manifest.finishedAt=new Date().toISOString();this.manifest.elapsedMs=Date.now()-Date.parse(this.manifest.startedAt);await this.save();await this.source();}
}
export async function testDatabase(o:Options){
 const base=process.env.QUEUE_DATABASE_URL??process.env.PG_TEST_DATABASE_URL??'postgresql://atlas_dev@127.0.0.1:55417/atlas_test',url=new URL(base);
 if(decodeURIComponent(url.pathname)!=='/atlas_test')throw new Error('This worktree builder may only connect to atlas_test');
 const admin=new Pool({connectionString:url.toString()}),schema=o.schema??'external_test_'+randomUUID().replaceAll('-','');
 if(!/^external_test_[a-z0-9_]+$/.test(schema))throw new Error('--schema must start with external_test_');
 await admin.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);url.searchParams.set('options','-c search_path='+schema+',public');
 const pool=new Pool({connectionString:url.toString()});
 try{await migratePostgres(pool);}catch(e){await pool.end();if(!o.schema)await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();throw e;}
 return {pool,schema,close:async()=>{await pool.end();if(!o.schema)await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}};
}
export async function seedNumbers(pool:Pool,o:Options){
 let ids:string[];
 if(o.seeds){const value=JSON.parse(await readFile(resolve(o.seeds),'utf8'));if(!Array.isArray(value)||value.some(x=>typeof x!=='string'))throw new Error('--seeds must be a JSON array of corpus publication numbers');ids=value;}
 else ids=(await pool.query('SELECT DISTINCT id FROM patents ORDER BY id')).rows.map(r=>r.id);
 return [...new Set(ids)].sort().slice(0,o.limit??Infinity).map(patentNumber);
}
export function fileFor(d:Discovery,stem:string){const candidates=d.files.filter(f=>f.name.replace(/\.(zip|gz)$/,'').replace(/\.tsv$/,'')===stem);if(candidates.length!==1)throw new Error(`Expected one ${stem} table in ODP product; got ${candidates.length}. Pin/review release before running.`);return candidates[0];}
