const internal=new Set(['embedding','locations','editedAt','editedFields']);
export const sourceFieldNames:Record<string,string>={id:'公开编号',title:'标题',abstract:'摘要',applicants:'申请人',assignees:'受让人',inventors:'发明人',publicationDate:'公开日期',filingDate:'申请日期',ipc:'IPC分类',cpc:'CPC分类',claims:'权利要求',description:'说明书',citations:'引证',familyId:'同族标识',familyMembers:'同族成员',legalStatus:'法律状态',legalAsOf:'法律状态时点',sourceUrl:'来源网址',sourceName:'来源名称',rawText:'来源全文',publicEvidence:'公开信息补充',number:'条款编号',text:'原文',sourceStart:'原文起点',sourceEnd:'原文终点',dependsOn:'引用条款'};
function equal(before:unknown,after:unknown):boolean{
 if(before===after)return true;
 if(Array.isArray(before)&&Array.isArray(after))return before.length===after.length&&before.every((value,index)=>equal(value,after[index]));
 if(before&&after&&typeof before==='object'&&typeof after==='object'){
  const left=before as Record<string,unknown>,right=after as Record<string,unknown>,keys=Object.keys(left);
  return keys.length===Object.keys(right).length&&keys.every(key=>Object.hasOwn(right,key)&&equal(left[key],right[key]));
 }
 return false;
}
export function sourceVersionChanges(before:Record<string,unknown>|null,after:Record<string,unknown>){
 return [...new Set([...Object.keys(before||{}),...Object.keys(after)])].filter(field=>!internal.has(field)&&!equal(before?.[field],after[field])).map(field=>({field,label:sourceFieldNames[field]||field,before:before?.[field],after:after[field]}));
}
export function sourceValueText(value:unknown):string{
 if(value===null||value===undefined)return '未保存';
 if(typeof value==='string')return value||'空值';
 if(Array.isArray(value))return value.length?value.map(sourceValueText).join('\n\n'):'无记录';
 if(typeof value==='object')return Object.entries(value).map(([key,item])=>`${sourceFieldNames[key]||key}：${sourceValueText(item)}`).join('\n');
 return String(value);
}
