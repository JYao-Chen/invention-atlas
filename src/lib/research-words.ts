// Count prose, excluding source handles and link destinations. Han characters
// count individually; other languages count by words rather than byte length.
export function researchWordCount(body:string){
 const text=body.replace(/\[\[(?:source|chart):[^\]]+\]\]/g,'').replace(/\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/https?:\/\/\S+/g,'');
 const han=text.match(/\p{Script=Han}/gu)||[];
 const other=text.replace(/\p{Script=Han}/gu,' ').match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu)||[];
 return han.length+other.length;
}
