import sharp from 'sharp';
import {chartColors} from '../components/chart-colors';
import type {AnalysisResult,Row} from '../lib/types';
const escape=(value:unknown)=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]!));
export type ChartImage={data:Buffer;width:number;height:number;caption:string};
export async function reportChartImages(result:AnalysisResult):Promise<ChartImage[]>{
 const chart=result.chart;if(!chart)return [];
 const rows=result.rows.filter(row=>row[chart.x]!==undefined&&typeof row[chart.y]==='number'&&Number.isFinite(row[chart.y]));if(!rows.length)return [];
 const pages:Row[][]=chart.kind==='line'?[rows]:Array.from({length:Math.ceil(rows.length/20)},(_,i)=>rows.slice(i*20,i*20+20));
 const images:ChartImage[]=[];
 const allValues=rows.map(row=>Number(row[chart.y]));
 const min=Math.min(0,...allValues),max=Math.max(0,...allValues),span=max-min||1;
 for(const [index,page] of pages.entries()){
  const labels=page.map(row=>Array.from(String(row[chart.x])).join('').match(/.{1,18}/gu)||['']);
  const rowHeights=labels.map(lines=>Math.max(28,lines.length*20+8));
  const width=1000,height=chart.kind==='line'?480:Math.max(300,rowHeights.reduce((a,b)=>a+b,0)+115),left=chart.kind==='line'?80:320,right=60,top=45,bottom=70,plotWidth=width-left-right,plotHeight=height-top-bottom;
  const values=page.map(row=>Number(row[chart.y]));
  const xValue=(n:number)=>left+(n-min)/span*plotWidth,yValue=(n:number)=>top+plotHeight-(n-min)/span*plotHeight;
  let content='';
  if(chart.kind==='bar'){
   const zero=xValue(0);content+=`<line x1="${zero}" x2="${zero}" y1="${top}" y2="${top+plotHeight}" stroke="#64748b"/>`;
   for(let i=0;i<=4;i++){const value=min+span*i/4;content+=`<text x="${xValue(value)}" y="${height-35}" text-anchor="middle">${escape(Number(value.toFixed(2)))}</text>`;}
   let y=top;
   for(const [i,row] of page.entries()){
    const value=Number(row[chart.y]),x=xValue(value);
    content+=`<text x="${left-12}" y="${y+18}" text-anchor="end">${labels[i].map((line,j)=>`<tspan x="${left-12}" dy="${j?20:0}">${escape(line)}</tspan>`).join('')}</text><rect x="${Math.min(x,zero)}" y="${y+2}" width="${Math.abs(x-zero)}" height="20" fill="${chartColors[(index*20+i)%chartColors.length]}"/><text x="${Math.min(width-45,x+8)}" y="${y+18}">${escape(Number(value.toFixed(4)))}</text>`;
    y+=rowHeights[i];
   }
  }else{
   const x=(i:number)=>left+i/Math.max(1,page.length-1)*plotWidth;
   for(let i=0;i<=4;i++){const value=min+span*i/4,y=yValue(value);content+=`<line x1="${left}" x2="${width-right}" y1="${y}" y2="${y}" stroke="#dbe2ea"/><text x="${left-10}" y="${y+5}" text-anchor="end">${escape(Number(value.toFixed(2)))}</text>`;}
   content+=`<polyline points="${values.map((v,i)=>x(i)+','+yValue(v)).join(' ')}" fill="none" stroke="${chartColors[0]}" stroke-width="3"/>`;
   content+=values.map((v,i)=>`<circle cx="${x(i)}" cy="${yValue(v)}" r="4" fill="${chartColors[0]}"/>`).join('');
   for(let i=0;i<page.length;i++)if(i%Math.max(1,Math.ceil(page.length/10))===0||i===page.length-1)content+=`<text x="${x(i)}" y="${height-35}" text-anchor="middle">${escape(page[i][chart.x])}</text>`;
  }
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="white"/><g font-family="sans-serif" font-size="16" fill="#263445"><text x="${left}" y="24">${escape(chart.y)}</text>${content}</g></svg>`;
  images.push({data:await sharp(Buffer.from(svg)).png().toBuffer(),width,height,caption:chart.kind==='bar'?`静态条形图 · ${chart.x} / ${chart.y} · 第${index*20+1}—${index*20+page.length}项，共${rows.length}项`:`静态折线图 · ${chart.x} / ${chart.y} · ${rows.length}项`});
 }
 return images;
}
