import type {Row} from './types';
export type CloudWord={word:string;value:number;x:number;y:number;size:number;width:number;height:number};
export function cloudLayout(rows:Row[],metric:string,width:number,height:number,measure:(word:string,size:number)=>number,limit=60,scale=1):{words:CloudWord[];total:number}{
 const weights=new Map<string,number>();for(const row of rows){const value=row[metric];if(typeof row.word==='string'&&typeof value==='number'&&Number.isFinite(value)&&value>0)weights.set(row.word,(weights.get(row.word)||0)+value);}
 const words=[...weights].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,limit),max=words[0]?.[1]||1,min=words.at(-1)?.[1]||0,placed:CloudWord[]=[];
 for(const [word,value] of words){let size=(14+(Math.sqrt((value-min)/Math.max(1e-9,max-min)))*(width<500?20:38))*Math.min(1,Math.sqrt(width*height/Math.max(1,words.length)/8000))*scale;let found=false;
  for(let shrink=0;shrink<7&&!found;shrink++,size*=.85){const w=measure(word,size)+8,h=size*1.35+6;for(let step=0;step<Math.max(1400,height*4);step++){const angle=step*.45,r=Math.sqrt(step)*6,x=width/2+Math.cos(angle)*r*1.4-w/2,y=height/2+Math.sin(angle)*r-h/2;if(x<0||y<0||x+w>width||y+h>height)continue;if(placed.some(p=>x<p.x+p.width&&x+w>p.x&&y<p.y+p.height&&y+h>p.y))continue;placed.push({word,value,x,y,size,width:w,height:h});found=true;break;}}
  if(!found){size=Math.max(8,size);const w=measure(word,size)+8,h=size*1.35+6;let best:{x:number;y:number;distance:number}|undefined;
   // Fill the closest available gap, rather than spilling leftovers into a top row.
   for(let y=0;y+h<=height;y+=4)for(let x=0;x+w<=width;x+=4){const distance=((x+w/2-width/2)/width)**2+((y+h/2-height/2)/height)**2;if(best&&distance>=best.distance)continue;if(placed.some(p=>x<p.x+p.width&&x+w>p.x&&y<p.y+p.height&&y+h>p.y))continue;best={x,y,distance};}
   if(best)placed.push({word,value,x:best.x,y:best.y,size,width:w,height:h});
  }
 }
 if(placed.length<words.length&&scale>.4)return cloudLayout(rows,metric,width,height,measure,limit,scale*.85);
 return {words:placed,total:words.length};
}
