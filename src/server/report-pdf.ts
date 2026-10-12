import {access,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {exportReportDocx} from './report-docx';

// Separate profiles prevent concurrent conversions from attaching to an
// existing desktop LibreOffice process or reusing another request's document.
export async function exportReportPdf(report:Parameters<typeof exportReportDocx>[0]):Promise<Buffer>{
 const root=resolve(process.env.PATENT_PDF_LIBREOFFICE_DIR||'/usr/lib/libreoffice');
 const registry=resolve(process.env.PATENT_PDF_REGISTRY_DIR||'/etc/libreoffice/registry');
 const binary=join(root,'program','soffice');
 try{await access(binary);await access(join(registry,'math.xcd'));}
 catch{throw new Error('PDF导出环境未就绪：需要安装LibreOffice Writer与Math组件，或配置PDF运行目录。');}
 const dir=await mkdtemp(join(tmpdir(),'atlas-report-pdf-'));
 try{
  const input=join(dir,'report.docx'),profile=join(dir,'profile');
  await writeFile(input,await exportReportDocx(report,'PDF'),{mode:0o600});
  const url=(path:string)=>pathToFileURL(path).href;
  await promisify(execFile)(binary,[
   '-env:BRAND_BASE_DIR='+url(root),'-env:LO_LIB_DIR='+url(join(root,'program')),
   '-env:CONFIGURATION_LAYERS=xcsxcu:'+url(registry)+' res:'+url(registry)+' user:!'+url(join(profile,'user','registrymodifications.xcu')),
   '-env:UserInstallation='+url(profile),'--headless','--convert-to','pdf:writer_pdf_Export','--outdir',dir,input,
  ],{timeout:120000,maxBuffer:1024*1024});
  const pdf=await readFile(join(dir,'report.pdf'));
  if(pdf.subarray(0,5).toString()!=='%PDF-')throw new Error('转换未生成有效PDF');
  return pdf;
 }catch{throw new Error('PDF转换失败或超时，未生成可下载文件；请重试或联系管理员检查导出环境。');}
 finally{await rm(dir,{recursive:true,force:true});}
}
