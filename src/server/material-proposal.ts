import {z} from 'zod';
import type {Pool} from 'pg';
import {ProjectMaterials} from './project-materials';
import {materialOcrResults} from './material-ocr-job';
export const materialOriginSchema=z.object({id:z.string().min(1),filename:z.string().min(1),ocrJobId:z.string().min(1).optional(),pages:z.array(z.number().int().positive()).min(1).optional()}).strict();
export async function materialProposal(pool:Pool,origin:z.infer<typeof materialOriginSchema>){
 const material=await new ProjectMaterials(pool).read(origin.id);
 if(material.filename!==origin.filename)throw new Error('材料文件名与来源不一致');
 let pages:{page:number|null;text:string}[]=material.extraction.pages;
 if(origin.ocrJobId){const result=await materialOcrResults(pool,origin.id,origin.ocrJobId);if(result.state!=='completed')throw new Error('请先完成OCR再创建查新任务');pages=result.pages;}
 if(origin.pages){if(new Set(origin.pages).size!==origin.pages.length||origin.pages.some(page=>!pages.some(item=>item.page===page)))throw new Error('选择页码不属于当前材料文本');pages=pages.filter(page=>page.page!==null&&origin.pages!.includes(page.page));}
 const text=pages.map(page=>page.text).join('\n\n').trim();
 if(text.length<20)throw new Error('材料至少需要20字符的可用文字');
 if(text.length>50000)throw new Error('材料超过查新输入上限，请选择较少页；不会截断原文');
 return text;
}
