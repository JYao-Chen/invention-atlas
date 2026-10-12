import {z} from 'zod';
import {materialOriginSchema} from './material-proposal';
const escape=(text:string)=>text.replace(/([\\`*_{}\[\]<>#!|])/g,'\\$1').replace(/[\r\n]+/g,' ');
export function materialOrigin(input:unknown){
 const origin=z.object({materialOrigin:materialOriginSchema.optional()}).parse(input).materialOrigin;if(!origin)return undefined;
 return {...origin,markdown:`> 输入材料：${escape(origin.filename)}；材料编号 ${escape(origin.id)}；${origin.ocrJobId?'OCR任务 '+escape(origin.ocrJobId):'原始提取文本'}；${origin.pages?'选页 '+origin.pages.join('、'):'全部可用文本页'}。\n> 查新使用任务创建时保存的文本快照。文件可能同时包含背景技术，方案特征仍需用户确认；OCR文本不等同原文。\n\n`};
}
