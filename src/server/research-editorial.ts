import {patentNumberPattern} from './report-conclusions';
// These are the report phrases the product owner explicitly asked to remove.
// Reject the draft for revision; never delete or alter source documents.
const unwanted:[RegExp,string][]=[
 [/方法与数据限制|自动审计待复核|免责声明|(?:^|\n)#{1,6}[^\n]*(?:局限性|字段[^\n]*缺失)/,'额外的限制、缺失字段或审计章节'],
 [/仅供参考|需(?:要)?人工复核|不构成.{0,15}(?:法律意见|法律建议)|结果仅代表当前/,'通用免责或人工复核提醒'],
 [/(?:不能|不得|不应|无法|不构成).{0,18}(?:外推|行业总量|全行业|全球分布)|(?:而非|而不是|不代表|并非)[^。\n]{0,24}(?:整个|全球|全行业|跨周期)/,'主动附加的样本外推提醒'],
 [/(?:legalStatus|familyMembers)[^\n]{0,120}(?:为\s*0|缺失|未提供)|未提供[^\n]{0,40}(?:法律状态|完整同族)/,'未提供字段的附加说明'],
 [/非独立(?:实验)?验证|(?:模型命名|主题归纳)[^\n]{0,25}(?:偏差|人工复核)/,'附加的模型或验证提醒'],
];
export function researchEditorialIssues(body:string){
 return unwanted.filter(([pattern])=>pattern.test(body)).map(([,description])=>description);
}

export function researchPatentMentions(body:string){
 const prose=body.replace(/\[\[(?:chart|source):[^\]]+\]\]/g,'').replace(/https?:\/\/\S+/g,'');
 return [...new Set([...prose.matchAll(patentNumberPattern)].map(m=>m[0].toUpperCase()))];
}
