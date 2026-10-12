import katex from 'katex';
import {XMLParser} from 'fast-xml-parser';
import {Math as WordMath,MathRun,MathFraction,MathSuperScript,MathSubScript,MathSubSuperScript,MathRadical,MathSum,MathIntegral,type MathComponent} from 'docx';
type Element=Record<string,unknown>;
function text(items:Element[]):string{return items.map(item=>item['#text']===undefined?Object.entries(item).filter(([key])=>key!==':@').map(([,children])=>Array.isArray(children)?text(children):'').join(''):String(item['#text'])).join('');}
function components(items:Element[]):MathComponent[]{
 const consumed=new Set<number>();
 return items.flatMap((item,index)=>{
  if(consumed.has(index))return [];
  const tag=Object.keys(item).find(key=>key!==':@'&&key!=='#text');if(!tag)return [];
  const children=item[tag] as Element[],part=(index:number)=>components([children[index]]);
  if(['math','semantics','mrow','mstyle'].includes(tag))return components(children);
  if(tag==='annotation')return [];
  if(['mi','mn','mo','mtext'].includes(tag))return [new MathRun(text(children))];
  if(tag==='mspace')return [new MathRun(' ')];
  if(tag==='mfrac')return [new MathFraction({numerator:part(0),denominator:part(1)})];
  const operator=text([children[0]]);
  if(['msub','msup','msubsup','munder','mover','munderover'].includes(tag)&&['∑','∫'].includes(operator)&&items[index+1]){
   const lower=['msub','msubsup','munder','munderover'].includes(tag)?part(1):undefined;
   const upper=['msup','mover'].includes(tag)?part(1):['msubsup','munderover'].includes(tag)?part(2):undefined;
   const operand=components([items[index+1]]);consumed.add(index+1);
   const options={children:operand,subScript:lower,superScript:upper,limits:tag.startsWith('mu')||tag==='mover'?'aboveBelow' as const:'side' as const};
   return [operator==='∑'?new MathSum(options):new MathIntegral(options)];
  }
  if(tag==='msup')return [new MathSuperScript({children:part(0),superScript:part(1)})];
  if(tag==='msub')return [new MathSubScript({children:part(0),subScript:part(1)})];
  if(tag==='msubsup')return [new MathSubSuperScript({children:part(0),subScript:part(1),superScript:part(2)})];
  if(tag==='msqrt')return [new MathRadical({children:components(children)})];
  if(tag==='mroot')return [new MathRadical({children:part(0),degree:part(1)})];
  throw new Error('尚不支持的Word公式结构：'+tag);
 });
}
export function wordMath(tex:string):WordMath|undefined{
 try{
  const rendered=katex.renderToString(tex,{output:'mathml',throwOnError:true,trust:false});
  const xml=rendered.match(/<math[\s\S]*?<\/math>/)?.[0];if(!xml)return;
  const parsed=new XMLParser({preserveOrder:true,ignoreAttributes:false,parseTagValue:false}).parse(xml) as Element[];
  return new WordMath({children:components(parsed)});
 }catch{return undefined;}
}
