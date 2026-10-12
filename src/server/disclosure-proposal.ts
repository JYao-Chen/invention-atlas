import {disclosureInput} from './technical-disclosure';
export function disclosureProposal(input:unknown){
 const source=disclosureInput.parse(input);
 if(source.solution.trim().length<20)throw new Error('请先提供至少20字符的具体技术方案，再创建查新任务');
 const proposal=[`方案名称\n${source.title}`,`技术方案\n${source.solution}`,...source.embodiments.map(item=>`用户提供的实施方式：${item.name}\n${item.description}`),...(source.alternatives?[`用户提供的替代方案\n${source.alternatives}`]:[])].join('\n\n');
 if(proposal.length>50000)throw new Error('方案及实施方式超过查新任务5万字符容量，请分别整理方案；不会截断原材料');
 return proposal;
}
