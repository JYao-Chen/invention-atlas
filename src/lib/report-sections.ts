export type ReportSection={key:string;title:string;level:number;start:number;end:number;text:string};
export function reportSections(markdown:string):ReportSection[]{
 const headers:{title:string;level:number;start:number}[]=[];let offset=0,fence:{character:string;length:number}|undefined;
 for(const line of markdown.split('\n')){
  const delimiter=line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
  if(delimiter){const character=delimiter[1][0];if(!fence)fence={character,length:delimiter[1].length};else if(character===fence.character&&delimiter[1].length>=fence.length&&!delimiter[2].trim())fence=undefined;}
  else if(!fence){const header=line.match(/^(#{1,6})[ \t]+(.*?)(?:[ \t]+#+[ \t]*)?\r?$/);if(header)headers.push({title:header[2],level:header[1].length,start:offset});}
  offset+=line.length+1;
 }
 const beginnings=[...(headers[0]?.start!==0?[{title:'开篇内容',level:0,start:0}]:[]),...headers],occurrences=new Map<string,number>();
 return beginnings.map((header,index)=>{const name=header.level+':'+header.title,occurrence=(occurrences.get(name)||0)+1;occurrences.set(name,occurrence);const end=beginnings[index+1]?.start??markdown.length;return {...header,key:name+':'+occurrence,end,text:markdown.slice(header.start,end)};});
}
export function replaceReportSection(markdown:string,section:ReportSection,text:string){
 if(markdown.slice(section.start,section.end)!==section.text)throw new Error('章节已变化，请重新选择当前版本的章节');
 return markdown.slice(0,section.start)+text+(section.end<markdown.length&&text&&!text.endsWith('\n')?'\n':'')+markdown.slice(section.end);
}
export function compareReportSections(before:string,after:string){
 const oldSections=reportSections(before),newSections=reportSections(after),oldByKey=new Map(oldSections.map(section=>[section.key,section])),newByKey=new Map(newSections.map(section=>[section.key,section]));
 return [...newSections.filter(section=>oldByKey.get(section.key)?.text!==section.text).map(section=>({key:section.key,title:section.title,status:oldByKey.has(section.key)?'changed' as const:'added' as const,before:oldByKey.get(section.key)?.text||'',after:section.text})),...oldSections.filter(section=>!newByKey.has(section.key)).map(section=>({key:section.key,title:section.title,status:'removed' as const,before:section.text,after:''}))];
}
