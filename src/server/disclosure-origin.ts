import {z} from 'zod';
const originSchema=z.object({type:z.literal('disclosure'),id:z.string().min(1),revision:z.number().int().positive(),title:z.string().min(1)});
const escape=(text:string)=>text.replace(/([\\`*_{}\[\]<>#!|])/g,'\\$1').replace(/[\r\n]+/g,' ');
export function disclosureOrigin(input:unknown){
 const data=z.object({proposalOrigin:originSchema.optional()}).parse(input);
 if(!data.proposalOrigin)return undefined;
 const origin=data.proposalOrigin;
 return {...origin,markdown:`> 方案来源：${escape(origin.title)}；交底材料编号 ${escape(origin.id)}，保存第${origin.revision}版。\n> 本次使用任务创建时保存的技术方案与实施方式；后续材料修改不改变本次方案快照。\n\n`};
}
