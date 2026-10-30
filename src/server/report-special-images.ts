import sharp from 'sharp';
import {cloudLayout} from '../lib/word-cloud';
import {chartColors} from '../components/chart-colors';
import type {AnalysisResult,Row} from '../lib/types';
import type {ChartImage} from './report-chart-image';
const escape=(value:unknown)=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]!));
async function image(content:string,width:number,height:number,caption:string):Promise<ChartImage>{return {data:await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="white"/><g font-family="sans-serif" fill="#263445">${content}</g></svg>`)).png().toBuffer(),width,height,caption};}
export async function reportSpecialImages(result:AnalysisResult):Promise<ChartImage[]>{
 const images:ChartImage[]=[];
 if(result.rows.some(row=>typeof row.word==='string')){
  const groups=new Map<string,Row[]>();
  for(const row of result.rows){const year=String(row.year??'全部');groups.set(year,[...(groups.get(year)||[]),row]);}
  for(const [year,rows] of groups){
   const metric=['tfidf','burst','tf','documents','weight','score'].find(key=>rows.some(row=>typeof row[key]==='number'&&Number(row[key])>0));if(!metric)continue;
   const weights=new Map<string,number>();for(const row of rows)if(typeof row.word==='string'&&typeof row[metric]==='number'&&Number(row[metric])>0)weights.set(row.word,(weights.get(row.word)||0)+Number(row[metric]));
   const words=[...weights].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([word,value])=>({word,[metric]:value}));
   for(let offset=0;offset<words.length;offset+=60){
    const page=words.slice(offset,offset+60),width=1000,height=600;
    const layout=cloudLayout(page,metric,width,height,(word,size)=>Array.from(word).reduce((sum,char)=>sum+(/[^\x00-\x7f]/.test(char)?1:.75),0)*size,page.length);
    const content=layout.words.map((word,i)=>`<text x="${word.x+word.width/2}" y="${word.y+word.height/2}" text-anchor="middle" dominant-baseline="central" font-size="${word.size}" font-weight="600" fill="${chartColors[i%chartColors.length]}">${escape(word.word)}</text>`).join('');
    images.push(await image(content,width,height,`静态词云 · ${year} · ${metric} · 第${offset+1}—${offset+page.length}项，共${words.length}词；绘出${layout.words.length}词。大小仅在本图内比较。`));
   }
  }
 }
 const map=result.clusterMap;
 if(map?.points.length){
  const width=1000,height=640,xs=map.points.map(point=>point.x),ys=map.points.map(point=>point.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const x=(value:number)=>60+(value-minX)/(maxX-minX||1)*880,y=(value:number)=>530-(value-minY)/(maxY-minY||1)*470;
  let content=`<line x1="60" y1="530" x2="940" y2="530" stroke="#64748b"/><line x1="60" y1="60" x2="60" y2="530" stroke="#64748b"/><text x="480" y="555" font-size="18">PC1</text><text x="15" y="35" font-size="18">PC2</text>`;
  content+=map.points.map(point=>`<circle cx="${x(point.x)}" cy="${y(point.y)}" r="5" fill="${chartColors[(point.cluster-1)%chartColors.length]}" fill-opacity=".85"/>`).join('');
  const clusters=[...new Set(map.points.map(point=>point.cluster))].sort((a,b)=>a-b);
  content+=clusters.map((cluster,i)=>`<circle cx="${60+i%6*150}" cy="${585+Math.floor(i/6)*28}" r="6" fill="${chartColors[(cluster-1)%chartColors.length]}"/><text x="${72+i%6*150}" y="${591+Math.floor(i/6)*28}" font-size="16">主题 ${cluster}</text>`).join('');
  images.push(await image(content,width,height,`静态聚类散点图 · 全部${map.points.length}项专利；PC1+PC2保留${((map.variance[0]+map.variance[1])*100).toFixed(1)}%方差。使用保存坐标。`));
 }
 const graph=result.graph;
 if(graph?.nodes.length){
  const width=1000,height=1000;
  const positions=new Map(graph.nodes.map((node,i)=>{
   const angle=i*2.399963229728653,radius=graph.nodes.length===1?0:420*Math.sqrt((i+.5)/graph.nodes.length);
   return [node.id,{x:500+Math.cos(angle)*radius,y:480+Math.sin(angle)*radius,index:i+1}];
  }));
  let drawn=0,content='<defs><marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#8895a5"/></marker></defs>';
  for(const edge of graph.edges){
   const a=positions.get(edge.source),b=positions.get(edge.target);if(!a||!b)continue;
   drawn++;
   if(a===b){content+=`<circle cx="${a.x+12}" cy="${a.y-12}" r="16" fill="none" stroke="#8895a5"/>`;continue;}
   const length=Math.hypot(b.x-a.x,b.y-a.y),inset=14/length;
   content+=`<line x1="${a.x+(b.x-a.x)*inset}" y1="${a.y+(b.y-a.y)*inset}" x2="${b.x-(b.x-a.x)*inset}" y2="${b.y-(b.y-a.y)*inset}" stroke="#8895a5" stroke-opacity=".55" stroke-width="${Math.min(4,1+Math.log1p(Math.max(0,edge.weight)))}"${edge.kind==='citation'?' marker-end="url(#arrow)"':''}/>`;
  }
  for(const node of graph.nodes){const p=positions.get(node.id)!;const color=node.kind==='external'?chartColors[4]:node.kind==='applicant'?chartColors[2]:chartColors[0];content+=`<circle cx="${p.x}" cy="${p.y}" r="14" fill="${color}"/><text x="${p.x}" y="${p.y+5}" text-anchor="middle" font-size="13" fill="white">${p.index}</text>`;}
  content+='<text x="40" y="960" font-size="16">蓝：样本节点　绿：申请人　橙：外部节点；编号对应节点明细</text>';
  images.push(await image(content,width,height,`静态网络图 · 全部${graph.nodes.length}个节点（含孤立节点），绘出${drawn}/${graph.edges.length}条边。引证箭头指向被引文献；线宽表示保存权重。密集网络请结合HTML交互版和完整明细。`));
 }
 return images;
}
