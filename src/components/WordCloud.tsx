'use client';
import {useEffect,useRef,useState} from 'react';
import type {Row} from '@/lib/types';
import {cloudLayout,type CloudWord} from '@/lib/word-cloud';
import {chartColors} from './chart-colors';
const textColors=chartColors.map(color=>'#'+color.slice(1).match(/../g)!.map(v=>Math.round(parseInt(v,16)*.62).toString(16).padStart(2,'0')).join(''));
const labels:Record<string,string>={tfidf:'TF-IDF 权重',tf:'原始词频',documents:'包含该词的专利数',burst:'突现强度',weight:'权重',score:'得分'};
export default function WordCloud({rows,metric,count}:{rows:Row[];metric:string;count:number}){
 const ref=useRef<HTMLDivElement>(null),[layout,setLayout]=useState<{words:CloudWord[];total:number}>({words:[],total:0}),[width,setWidth]=useState(800),[selected,setSelected]=useState<string>();
 const height=Math.max(400,Math.ceil(count/30)*200);
 useEffect(()=>{const container=ref.current;if(!container)return;const ctx=document.createElement('canvas').getContext('2d')!;let lastWidth=0;
  const update=(force=false)=>{const w=Math.max(260,container.clientWidth);if(!force&&w===lastWidth)return;lastWidth=w;setWidth(w);setLayout(cloudLayout(rows,metric,w,height,(word,size)=>{ctx.font=`600 ${size}px Geist, sans-serif`;return ctx.measureText(word).width;},count));};
  update();const observer=new ResizeObserver(()=>update());observer.observe(container);let alive=true;void document.fonts.ready.then(()=>{if(alive)update(true);});return()=>{alive=false;observer.disconnect();};
 },[rows,metric,count,height]);
 const word=layout.words.find(p=>p.word===selected),matches=rows.filter(row=>row.word===selected);
 const values=Object.keys(labels).flatMap(key=>{const items=matches.map(row=>row[key]).filter((v):v is number=>typeof v==='number'&&Number.isFinite(v));return items.length?[[key,items.reduce((a,b)=>a+b,0)] as const]:[];});
 return <div ref={ref} className="word-cloud" onKeyDown={e=>{if(e.key==='Escape')setSelected(undefined);}}>
  <svg viewBox={`0 0 ${width} ${height}`} role="group" aria-label="关键词词云">{layout.words.map((p,i)=><text key={p.word} x={p.x+p.width/2} y={p.y+p.height/2} textAnchor="middle" dominantBaseline="central" fontFamily="Geist, sans-serif" fontSize={p.size} fontWeight={600} fill={textColors[i%textColors.length]} role="button" tabIndex={0} aria-label={'查看关键词 '+p.word} aria-pressed={selected===p.word} onClick={()=>setSelected(p.word)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(p.word);}}}><title>{p.word} · {labels[metric]||metric}: {p.value.toFixed(3)}</title>{p.word}</text>)}</svg>
  {!layout.words.length&&<p className="empty">没有可绘制的关键词。</p>}
  {layout.words.length<count&&<p className="graph-note">当前画布容纳 {layout.words.length} 个词</p>}
  {word&&<section className="word-cloud-detail" role="region" aria-label="关键词详情" style={{left:Math.max(8,Math.min(width-268,word.x+word.width/2)),top:Math.max(8,Math.min(height-200,word.y+word.height+8))}}>
   <header><strong>{word.word}</strong><button type="button" aria-label="关闭关键词详情" onClick={()=>setSelected(undefined)}>×</button></header>
   <dl>{values.map(([key,value])=><div key={key}><dt>{labels[key]}</dt><dd>{Number.isInteger(value)?value:value.toFixed(3)}</dd></div>)}</dl>
   {matches.length>1&&<small>合并当前范围 {matches.length} 行的指标值</small>}
  </section>}
 </div>;
}
