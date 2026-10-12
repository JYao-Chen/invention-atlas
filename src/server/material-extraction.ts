import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {XMLParser} from 'fast-xml-parser';
type XmlNode=Record<string,unknown>;
function xmlText(nodes:XmlNode[]):string{
 return nodes.map(node=>{
  if('#text' in node)return String(node['#text']);
  return Object.entries(node).filter(([tag])=>tag!==':@').map(([tag,value])=>{
   if(tag==='w:del'||tag.endsWith('Pr'))return '';
   if(tag==='w:tab')return '\t';if(tag==='w:br'||tag==='w:cr')return '\n';
   const content=Array.isArray(value)?xmlText(value):'';
   return content+(tag==='w:p'||tag==='w:tr'?'\n':tag==='w:tc'?'\t':'');
  }).join('');
 }).join('');
}
export function docxMaterialText(xml:string){
 const parser=new XMLParser({preserveOrder:true,ignoreAttributes:true,parseTagValue:false,trimValues:false});
 return xmlText(parser.parse(xml) as XmlNode[]).trim();
}
export async function extractMaterial(file:File,signal?:AbortSignal){
 if(file.size===0||file.size>10*1024*1024)throw new Error('材料文件应为1字节至10MB');
 const extension=extname(file.name).toLowerCase();if(!['.txt','.md','.docx','.pdf'].includes(extension))throw new Error('请选择TXT、Markdown、DOCX或PDF材料');
 signal?.throwIfAborted();
 const bytes=Buffer.from(await file.arrayBuffer()),warnings:string[]=[];
 let pages:{page:number|null;text:string;status:'extracted'|'needs_ocr'}[];
 if(extension==='.txt'||extension==='.md'){
  let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new Error('文本不是UTF-8编码，请转换后再上传');}
  pages=[{page:null,text,status:'extracted'}];
 }else{
  const dir=await mkdtemp(join(tmpdir(),'atlas-material-'));
  try{
   const path=join(dir,'material'+extension);await writeFile(path,bytes,{mode:0o600});
   if(extension==='.docx'){
    const {stdout}=await promisify(execFile)('unzip',['-p',path,'word/document.xml'],{timeout:30000,maxBuffer:8*1024*1024,signal});
    pages=[{page:null,text:docxMaterialText(stdout),status:'extracted'}];
    warnings.push('Word正文按文档结构提取，未保留排版页码、附图、页眉页脚和脚注；自动编号与复杂公式需对照原文件。');
   }else{
    const {stdout}=await promisify(execFile)('pdftotext',['-layout',path,'-'],{timeout:60000,maxBuffer:8*1024*1024,signal});
    const texts=stdout.split('\f');if(texts.at(-1)==='')texts.pop();
    pages=texts.map((text,index)=>({page:index+1,text,status:text.trim()?'extracted':'needs_ocr'}));
    if(pages.some(page=>page.status==='needs_ocr'))warnings.push('无文本页可能是扫描页、空白页或仅含图片；尚未OCR，不作为已提取正文。');
    warnings.push('PDF文字按页面提取，多栏、公式与表格阅读顺序需对照原文件；不提取图像内容。');
   }
  }catch(error){if(signal?.aborted)throw error;throw new Error('材料提取失败：文件可能损坏、加密，或服务器缺少unzip/pdftotext组件。');}
  finally{await rm(dir,{recursive:true,force:true});}
 }
 const text=pages.map(page=>page.text).join('\n\n');if(text.length>500000)throw new Error('材料提取超过50万字符，请拆分后上传，不会截断内容');
 return {filename:file.name,format:extension.slice(1),pages,text,warnings,saved:false,modelAssisted:false};
}
