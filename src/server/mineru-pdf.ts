import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {parseMineruCloud,type MineruCheckpoint} from './mineru-cloud';
import type {OcrPage} from './material-ocr';
type Part={pages:number[];checkpoint?:MineruCheckpoint;results?:OcrPage[]};
export function mineruContentPages(content:unknown,pages:number[]):OcrPage[]{
 if(!Array.isArray(content))throw new Error('MinerU结果缺少逐页内容，不能可靠对应原文页码');
 const text=pages.map(()=>[] as string[]);
 for(const item of content){
  const index=Number(item.page_idx);if(!Number.isInteger(index)||index<0||index>=pages.length)throw new Error('MinerU返回的页码超出解析分片');
  const blocks=[item.text,item.table_body,item.image_caption?.join('\n'),item.table_caption?.join('\n'),item.table_footnote?.join('\n')].filter(value=>typeof value==='string'&&value.trim());
  if(item.type==='equation'&&item.text)blocks[0]='$$\n'+item.text+'\n$$';
  text[index].push(...blocks);
 }
 return pages.map((page,index)=>({page,text:text[index].join('\n\n'),method:'ocr',engine:'mineru-cloud',language:process.env.PATENT_MINERU_LANGUAGE||'ch',meanWordConfidence:null,status:text[index].length?'recognized':'unreadable'}));
}
export async function recognizeMineruPdf(bytes:Buffer,pages:number[],options:{signal?:AbortSignal;load:(part:number)=>Promise<Part|undefined>;save:(part:number,value:Part)=>Promise<void>;onPage?:(page:OcrPage)=>Promise<void>}):Promise<OcrPage[]>{
 const dir=await mkdtemp(join(tmpdir(),'atlas-mineru-')),run=promisify(execFile),results:OcrPage[]=[];
 const execute=(cmd:string,args:string[])=>run(cmd,args,{signal:options.signal,timeout:120000,maxBuffer:64*1024*1024});
 try{
  const input=join(dir,'input.pdf');await writeFile(input,bytes,{mode:0o600});
  // Extract only requested pages; the original file is never changed or rasterized.
  for(const page of pages)await execute('pdfseparate',['-f',String(page),'-l',String(page),input,join(dir,'page-%d.pdf')]);
  const parts:{pages:number[];bytes:Buffer}[]=[];
  async function split(selected:number[]){
   const target=join(dir,'part.pdf');
   if(selected.length===1)await writeFile(target,await readFile(join(dir,'page-'+selected[0]+'.pdf')));
   else await execute('pdfunite',[...selected.map(page=>join(dir,'page-'+page+'.pdf')),target]);
   const data=await readFile(target);await rm(target);
   if(data.length>10*1024*1024&&selected.length>1){const middle=Math.floor(selected.length/2);await split(selected.slice(0,middle));await split(selected.slice(middle));return;}
   if(data.length>10*1024*1024)throw new Error('单页PDF超过MinerU分片上传大小，请压缩原始材料后重试');
   parts.push({pages:selected,bytes:data});
  }
  for(let index=0;index<pages.length;index+=100)await split(pages.slice(index,index+100));
  for(let index=0;index<parts.length;index++){
   options.signal?.throwIfAborted();const part=parts[index],number=index+1;let saved=await options.load(number);
   if(saved&&JSON.stringify(saved.pages)!==JSON.stringify(part.pages))throw new Error('MinerU续跑分片页码与原任务不一致');
   saved||={pages:part.pages};
   if(!saved.results){
    const output=await parseMineruCloud(part.bytes,'material-part-'+number+'.pdf',{signal:options.signal,checkpoint:saved.checkpoint,save:async checkpoint=>{saved!.checkpoint=checkpoint||undefined;await options.save(number,saved!);}});
    if(!output.full_zip_url)throw new Error('MinerU未返回含逐页内容的结果包，不能将全文误归到某一页');
    const signal=AbortSignal.any([AbortSignal.timeout(10*60*1000),...(options.signal?[options.signal]:[])]);
    const response=await fetch(output.full_zip_url,{signal});if(!response.ok)throw new Error('MinerU结果下载失败：HTTP '+response.status);
    const archive=join(dir,'result.zip');await writeFile(archive,new Uint8Array(await response.arrayBuffer()),{mode:0o600});
    const names=(await execute('unzip',['-Z1',archive])).stdout.split(/\r?\n/),contentName=names.find(name=>name.endsWith('_content_list.json'));
    if(!contentName)throw new Error('MinerU结果包缺少逐页content_list，不能可靠定位原文');
    saved.results=mineruContentPages(JSON.parse((await execute('unzip',['-p',archive,contentName])).stdout),part.pages);
    await options.save(number,saved);await rm(archive);
   }
   for(const page of saved.results){results.push(page);await options.onPage?.(page);}
  }
  return results;
 }finally{await rm(dir,{recursive:true,force:true});}
}
