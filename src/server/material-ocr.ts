import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
export type OcrPage={page:number;text:string;method:'ocr';engine?:'mineru-cloud'|'tesseract';language:string;meanWordConfidence:number|null;status:'recognized'|'unreadable'};
export function ocrConfidence(tsv:string):number|null{
 const scores=tsv.split(/\r?\n/).slice(1).map(line=>line.split('\t')).filter(columns=>columns[0]==='5'&&columns[11]?.trim()).map(columns=>Number(columns[10])).filter(score=>Number.isFinite(score)&&score>=0);
 return scores.length?scores.reduce((sum,value)=>sum+value,0)/scores.length:null;
}
/** The callback is awaited after each page so a durable job can checkpoint it. */
export async function recognizePdfPages(bytes:Buffer,pages:number[],options:{signal?:AbortSignal;onPage?:(page:OcrPage)=>Promise<void>}={}):Promise<OcrPage[]>{
 if(!pages.length||pages.some(page=>!Number.isInteger(page)||page<1)||new Set(pages).size!==pages.length)throw new Error('OCR页码应为不重复的正整数');
 const dir=await mkdtemp(join(tmpdir(),'atlas-material-ocr-')),results:OcrPage[]=[];
 try{
  const input=join(dir,'material.pdf');await writeFile(input,bytes,{mode:0o600});
  for(const page of pages){
   options.signal?.throwIfAborted();const base=join(dir,'page-'+page);
   try{
    await promisify(execFile)('pdftoppm',['-f',String(page),'-l',String(page),'-singlefile','-r','150','-png',input,base],{timeout:90000,maxBuffer:1024*1024,signal:options.signal});
    await promisify(execFile)('tesseract',[base+'.png',base,'-l','chi_sim+eng','txt','tsv'],{timeout:90000,maxBuffer:1024*1024,signal:options.signal});
   }catch(error){if(options.signal?.aborted)throw error;throw new Error('第'+page+'页OCR失败：请检查PDF及Poppler、Tesseract中文/英文语言包。已完成页可由任务记录恢复。');}
   const text=await readFile(base+'.txt','utf8'),tsv=await readFile(base+'.tsv','utf8');
   const result:OcrPage={page,text,method:'ocr',language:'chi_sim+eng',meanWordConfidence:ocrConfidence(tsv),status:text.trim()?'recognized':'unreadable'};
   results.push(result);await options.onPage?.(result);
   await Promise.all(['.png','.txt','.tsv'].map(extension=>rm(base+extension)));
  }
  return results;
 }finally{await rm(dir,{recursive:true,force:true});}
}
