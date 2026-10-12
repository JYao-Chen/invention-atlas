import {z} from 'zod';

const text=z.string().trim().max(50000).default('');
export const disclosureInput=z.object({
 title:z.string().trim().min(1).max(300),
 technicalField:text,background:text,problem:text,solution:text,
 embodiments:z.array(z.object({name:z.string().trim().min(1).max(300),description:z.string().trim().min(1).max(50000)})).max(50).default([]),
 effects:z.array(z.object({statement:z.string().trim().min(1).max(5000),basis:z.enum(['expected','observed']),evidence:text})).max(100).default([]),
 drawings:z.array(z.object({name:z.string().trim().min(1).max(300),description:z.string().trim().min(1).max(5000)})).max(100).default([]),
 alternatives:text,
}).strict();
export type DisclosureInput=z.infer<typeof disclosureInput>;
export function prepareDisclosure(input:unknown){
 const source=disclosureInput.parse(input);
 const questions:{field:string;question:string;required:boolean}[]=[];
 const ask=(field:string,question:string,required=true)=>questions.push({field,question,required});
 if(!source.technicalField)ask('technicalField','方案属于哪个技术领域，具体应用对象是什么？');
 if(!source.background)ask('background','现有方案采用什么技术措施，存在什么具体不足？');
 if(!source.problem)ask('problem','本方案要解决的具体技术问题是什么？');
 if(!source.solution)ask('solution','请说明组成部件或步骤，以及连接关系、执行顺序和关键约束。');
 if(!source.embodiments.length)ask('embodiments','请提供至少一种可以实施的实例，说明部件或步骤如何配合，以及必要参数和条件。');
 if(!source.effects.length)ask('effects','采用哪些技术措施产生哪些预期或实测效果？请区分预期效果与已有验证。',false);
 source.effects.forEach((effect,index)=>{
  if(effect.basis==='observed'&&!effect.evidence)ask(`effects.${index}.evidence`,'该项实测效果的实验条件、比较对象和结果依据是什么？');
 });
 if(!source.alternatives)ask('alternatives','是否存在可替换部件、不同步骤顺序或其他实施条件？如有，请说明。',false);
 return {source,questions,readyForDraft:!questions.some(question=>question.required),
  notes:['缺项问题仅检查用户是否提供对应材料，不认证技术方案可实施性。','预期效果不能改写为实验结果；附图说明不表示已生成或上传附图。','交底书草稿不属于专利申请文件，也不包含新颖性、创造性或保护范围结论。']};
}

const headingText=(value:string)=>value.replace(/[\\`*_{}\[\]<>#!|]/g,'\\$&').replace(/[\r\n]+/g,' ');
const quoted=(value:string)=>value.split('\n').map(line=>'> '+line).join('\n');
export function disclosureDraft(input:unknown){
 const prepared=prepareDisclosure(input);
 if(!prepared.readyForDraft)throw new Error('请先补齐交底材料中的必需项，再生成草稿');
 const source=prepared.source;
 const sections=[
  {id:'field',title:'技术领域',body:quoted(source.technicalField)},
  {id:'background',title:'背景技术',body:quoted(source.background)},
  {id:'problem',title:'技术问题',body:quoted(source.problem)},
  {id:'solution',title:'技术方案',body:quoted(source.solution)},
  {id:'embodiments',title:'实施方式',body:source.embodiments.map((item,index)=>`### ${index+1}. ${headingText(item.name)}\n\n${quoted(item.description)}`).join('\n\n')},
  {id:'effects',title:'技术效果',body:source.effects.length?source.effects.map((effect,index)=>`### ${index+1}. ${effect.basis==='expected'?'预期效果':'用户声明的实测效果'}\n\n${quoted(effect.statement)}${effect.evidence?'\n\n用户提供的依据\n\n'+quoted(effect.evidence):'\n\n未提供实测依据，不作为已验证结果。'}`).join('\n\n'):'本次材料未提供技术效果。'},
  {id:'drawings',title:'附图说明',body:source.drawings.length?source.drawings.map((drawing,index)=>`### ${index+1}. ${headingText(drawing.name)}\n\n${quoted(drawing.description)}`).join('\n\n'):'本次材料未提供附图说明。'},
  {id:'alternatives',title:'替代方案',body:source.alternatives?quoted(source.alternatives):'本次材料未提供替代方案。'},
 ];
 const markdown=`# ${headingText(source.title)}\n\n技术交底书草稿 · 用户材料整理\n\n原文材料以引用块保存；本草稿未补充技术事实，也未核验用户声明的实验结果。\n\n${sections.map(section=>`## ${section.title}\n\n${section.body}`).join('\n\n')}\n\n## 待补事项\n\n${prepared.questions.length?prepared.questions.map(question=>'- '+question.question).join('\n'):'结构化字段已提供。字段完整不表示技术内容充分或具有可专利性。'}\n\n本草稿不属于专利申请文件，不包含新颖性、创造性或保护范围结论。\n`;
 return {source,sections,markdown,questions:prepared.questions,modelAssisted:false as const,notes:prepared.notes};
}
