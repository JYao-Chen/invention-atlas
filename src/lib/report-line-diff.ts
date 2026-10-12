export type ReportLineChange={kind:'same'|'added'|'removed';text:string};
/** Align exact lines; preserve original spaces and avoid quadratic memory for long chapters. */
export function reportLineDiff(before:string,after:string):ReportLineChange[]{
 const a=before.split('\n'),b=after.split('\n');
 if(a.length*b.length>1000000)return [{kind:'removed',text:before},{kind:'added',text:after}];
 const width=b.length+1,table=new Uint32Array((a.length+1)*width);
 for(let i=a.length-1;i>=0;i--)for(let j=b.length-1;j>=0;j--)table[i*width+j]=a[i]===b[j]?table[(i+1)*width+j+1]+1:Math.max(table[(i+1)*width+j],table[i*width+j+1]);
 const changes:ReportLineChange[]=[];let i=0,j=0;
 while(i<a.length||j<b.length){
  if(i<a.length&&j<b.length&&a[i]===b[j]){changes.push({kind:'same',text:a[i++]});j++;}
  else if(i<a.length&&(j===b.length||table[(i+1)*width+j]>=table[i*width+j+1]))changes.push({kind:'removed',text:a[i++]});
  else changes.push({kind:'added',text:b[j++]});
 }
 return changes;
}
