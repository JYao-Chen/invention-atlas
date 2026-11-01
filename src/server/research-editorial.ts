import {patentNumberPattern} from './report-conclusions';
// These are the report phrases the product owner explicitly asked to remove.
// Reject the draft for revision; never delete or alter source documents.
const unwanted:[RegExp,string][]=[
 [/自动审计待复核|(?:^|\n)#{1,6}\s*(?:免责声明|通用风险提示|使用免责声明)\s*(?:\n|$)/,'通用免责或自动审计章节'],
 [/仅供参考|需(?:要)?人工复核|不构成.{0,15}(?:法律意见|法律建议)/,'通用免责或人工复核提醒'],
];
export function researchEditorialIssues(body:string){
 return unwanted.filter(([pattern])=>pattern.test(body)).map(([,description])=>description);
}

export function researchPatentMentions(body:string){
 const prose=body.replace(/\[\[(?:chart|source):[^\]]+\]\]/g,'').replace(/https?:\/\/\S+/g,'');
 return [...new Set([...prose.matchAll(patentNumberPattern)].map(m=>m[0].toUpperCase()))];
}
