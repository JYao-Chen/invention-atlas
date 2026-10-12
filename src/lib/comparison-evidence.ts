export type ComparisonSource={patentId:string;documentVersion:string;section:string;claimNumber?:number;start:number;end:number;text:string;ordinal:number;sourceUrl?:string};
export function evidenceFromSelection(source:ComparisonSource,start:number,end:number){
 if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<=start||end>source.text.length)throw new Error('请在原文中选择非空文本');
 return {patentId:source.patentId,documentVersion:source.documentVersion,section:source.section,claimNumber:source.claimNumber,start:source.start+start,end:source.start+end,quote:source.text.slice(start,end),sourceUrl:source.sourceUrl};
}
