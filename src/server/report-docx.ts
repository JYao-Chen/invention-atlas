import {runCopy} from '../lib/result-copy';
import {Document,Packer,Paragraph,TextRun,Table,TableRow,TableCell,WidthType,HeadingLevel,ExternalHyperlink,LevelFormat,ShadingType,BorderStyle,ImageRun,TableLayoutType} from 'docx';
import {fromMarkdown} from 'mdast-util-from-markdown';
import {gfm} from 'micromark-extension-gfm';
import {gfmFromMarkdown} from 'mdast-util-gfm';
import {math} from 'micromark-extension-math';
import {mathFromMarkdown} from 'mdast-util-math';
import {partitionRows} from '../lib/result-tables';
import type {Run,AnalysisResult} from '../lib/types';
import {wordMath} from './word-math';
import {reportChartImages} from './report-chart-image';
import {reportSpecialImages} from './report-special-images';
import {mathMarkdown} from '../lib/math-markdown';
import type {Math as WordMath} from 'docx';
type Node={type:string;value?:string;depth?:number;url?:string;ordered?:boolean;start?:number;children?:Node[]};
type Block=Paragraph|Table;
type Inline=TextRun|ExternalHyperlink|WordMath;
const value=(node:Node):string=>node.value??(node.children||[]).map(value).join('');
function inline(nodes:Node[],style:{bold?:boolean;italics?:boolean}={}):Inline[]{
 return nodes.flatMap((node):Inline[]=>{
  if(node.type==='strong')return inline(node.children||[],{...style,bold:true});
  if(node.type==='emphasis')return inline(node.children||[],{...style,italics:true});
  if(node.type==='link'&&node.url&&/^https?:\/\//.test(node.url))return [new ExternalHyperlink({link:node.url,children:[new TextRun({text:value(node),style:'Hyperlink',...style})]})];
  if(node.type==='break')return [new TextRun({break:1})];
  if(node.type==='inlineMath')return [wordMath(value(node))||new TextRun({text:'〔未转换公式，LaTeX原式：'+value(node)+'〕',...style})];
  return [new TextRun({text:value(node),...(node.type==='inlineCode'?{font:'Consolas'}:{}),...style})];
 });
}
function table(rows:string[][]){
 const count=Math.max(...rows.map(row=>row.length),1),width=9360;
 const weights=Array.from({length:count},(_,i)=>Math.max(1,Math.min(4,Math.sqrt(Math.max(...rows.map(row=>Array.from(row[i]||'').length),1)/12))));
 const total=weights.reduce((a,b)=>a+b,0),columns=weights.map(weight=>Math.floor(width*weight/total));
 columns[columns.length-1]+=width-columns.reduce((a,b)=>a+b,0);
 return new Table({layout:TableLayoutType.FIXED,width:{size:width,type:WidthType.DXA},columnWidths:columns,rows:rows.map((row,index)=>new TableRow({tableHeader:index===0,children:columns.map((size,col)=>new TableCell({width:{size,type:WidthType.DXA},...(index===0?{shading:{type:ShadingType.CLEAR,fill:'EEF2F6'}}:{}),children:(row[col]||'').split(/\r?\n/).map(text=>new Paragraph({spacing:{after:60},children:[new TextRun({text,bold:index===0,size:20})]}))}))}))});
}
function resultTables(rows:string[][]):Block[]{
 const count=rows[0]?.length||0;if(count<=6)return [table(rows)];
 const blocks:Block[]=[];
 for(let offset=1;offset<count;offset+=5){const indices=[0,...Array.from({length:Math.min(5,count-offset)},(_,i)=>offset+i)];blocks.push(new Paragraph({text:`字段分表 ${Math.floor((offset-1)/5)+1} · 首列保留用于对应同一记录`}),table(rows.map(row=>indices.map(i=>row[i]||''))));}
 return blocks;
}
function markdown(text:string):Block[]{
 const root=fromMarkdown(mathMarkdown(text),{extensions:[gfm(),math()],mdastExtensions:[gfmFromMarkdown(),mathFromMarkdown()]}) as Node;
 const blocks:Block[]=[];
 const visit=(node:Node,level=0,list?:{reference:string;level:number})=>{
  if(node.type==='heading'){const headings=[HeadingLevel.HEADING_1,HeadingLevel.HEADING_2,HeadingLevel.HEADING_3,HeadingLevel.HEADING_4,HeadingLevel.HEADING_5,HeadingLevel.HEADING_6];blocks.push(new Paragraph({heading:headings[(node.depth||1)-1],children:inline(node.children||[])}));}
  else if(node.type==='paragraph')blocks.push(new Paragraph({children:inline(node.children||[]),...(list?{numbering:list}:{}),spacing:{after:160}}));
  else if(node.type==='table')blocks.push(table((node.children||[]).map(row=>(row.children||[]).map(value))));
  else if(node.type==='list')for(const item of node.children||[])for(const [index,child] of (item.children||[]).entries())visit(child,Math.min(level+1,8),index===0?{reference:node.ordered?'numbered':'bullets',level:Math.min(level,8)}:undefined);
  else if(node.type==='math'){const converted=wordMath(node.value||'');if(converted)blocks.push(new Paragraph({children:[converted]}));else blocks.push(new Paragraph({text:'未转换公式，LaTeX原式：'+(node.value||'')}));}
  else if(node.type==='code')for(const line of (node.value||'').split('\n'))blocks.push(new Paragraph({children:[new TextRun({text:line,font:'Consolas'})]}));
  else if(node.type==='thematicBreak')blocks.push(new Paragraph({border:{bottom:{style:BorderStyle.SINGLE,color:'CCCCCC',size:4,space:1}}}));
  else for(const child of node.children||[])visit(child,level,list);
 };
 visit(root);return blocks;
}
async function resultBlocks(result:AnalysisResult):Promise<Block[]>{
 const blocks:Block[]=[new Paragraph({text:result.title,heading:HeadingLevel.HEADING_2}),...markdown(result.summary)];
 for(const image of [...await reportSpecialImages(result),...await reportChartImages(result)]){const scale=Math.min(624/image.width,760/image.height);blocks.push(new Paragraph({children:[new ImageRun({type:'png',data:image.data,transformation:{width:image.width*scale,height:image.height*scale},altText:{title:result.title,description:image.caption,name:'工具结果图表'}})]}),new Paragraph({text:image.caption}));}
 for(const group of partitionRows(result.rows))blocks.push(...resultTables([group.keys,...group.rows.map(row=>group.keys.map(key=>typeof row[key]==='object'?JSON.stringify(row[key]):String(row[key]??'')))]));
 if(result.clusterMap)blocks.push(new Paragraph({text:'聚类坐标明细',heading:HeadingLevel.HEADING_3}),table([['公开编号','标题','主题','PC1','PC2'],...result.clusterMap.points.map(point=>[point.patent,point.title,String(point.cluster),String(point.x),String(point.y)])]));
 if(result.graph)blocks.push(...markdown('图谱的完整节点与边数据：'),table([['图中编号','标识','名称','类型','数值'],...result.graph.nodes.map((node,i)=>[String(i+1),node.id,node.label,node.kind,String(node.value)])]),table([['来源','目标','权重','关系类型'],...result.graph.edges.map(edge=>[edge.source,edge.target,String(edge.weight),edge.kind||'未指定'])]));
 return blocks;
}
export async function exportReportDocx(report:{title:string;run:Run;revision?:number},format:'Word'|'PDF'='Word'){
 report={...report,run:runCopy(report.run)};
 const used=new Set<string>(),blocks:Block[]=[new Paragraph({text:report.title,heading:HeadingLevel.TITLE}),new Paragraph({text:`数据集 ${report.run.datasetId} · ${report.run.createdAt}${report.revision?' · 人工编辑草稿第'+report.revision+'版':''}`}),new Paragraph({text:format+'版保留正文与完整工具结果表；交互图表请使用HTML版。无法转换的公式标注并保留LaTeX原式。'})];
 for(const part of report.run.answer.split(/(\[\[chart:[a-zA-Z0-9-]+\]\])/g)){
  const id=part.match(/^\[\[chart:([^\]]+)\]\]$/)?.[1];
  if(!id){blocks.push(...markdown(part));continue;}
  const result=report.run.results.find(item=>item.id===id);if(result&&!used.has(id)){used.add(id);blocks.push(...await resultBlocks(result));}
 }
 for(const result of report.run.results)if(!used.has(result.id))blocks.push(...await resultBlocks(result));
 return Packer.toBuffer(new Document({creator:'专利分析平台',title:report.title,styles:{default:{document:{run:{font:'Microsoft YaHei',size:22},paragraph:{spacing:{after:120}}}}},numbering:{config:['bullets','numbered'].map(reference=>({reference,levels:Array.from({length:9},(_,level)=>({level,format:reference==='bullets'?LevelFormat.BULLET:LevelFormat.DECIMAL,text:reference==='bullets'?'•':'%'+(level+1)+'.',style:{paragraph:{indent:{left:720*(level+1),hanging:360}}}}))}))},sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:1273,bottom:1273,left:1273,right:1273}}},children:blocks}]}));
}
