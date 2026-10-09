'use client';
import {useEffect,useRef,useState} from 'react';
import type {Row} from '@/lib/types';
import {cloudLayout,type CloudWord} from '@/lib/word-cloud';
import {chartColors} from './chart-colors';
const textColors=chartColors.map(color=>'#'+color.slice(1).match(/../g)!.map(v=>Math.round(parseInt(v,16)*.62).toString(16).padStart(2,'0')).join(''));
export default function WordCloud({rows,metric,count}:{rows:Row[];metric:string;count:number}){
 const ref=useRef<HTMLDivElement>(null),[layout,setLayout]=useState<{words:CloudWord[];total:number}>({words:[],total:0}),[width,setWidth]=useState(800),[selected,setSelected]=useState<CloudWord>();
 const height=Math.max(400,Math.ceil(count/30)*200);
 useEffect(()=>{const container=ref.current;if(!container)return;const ctx=document.createElement('canvas').getContext('2d')!;const update=()=>{const w=Math.max(260,container.clientWidth);setWidth(w);setLayout(cloudLayout(rows,metric,w,height,(word,size)=>{ctx.font=`600 ${size}px Geist, sans-serif`;return ctx.measureText(word).width;},count));setSelected(undefined);};update();const observer=new ResizeObserver(update);observer.observe(container);let alive=true;void document.fonts.ready.then(()=>{if(alive)update();});return()=>{alive=false;observer.disconnect();};},[rows,metric,count,height]);
 return <div ref={ref} className="word-cloud"><svg viewBox={`0 0 ${width} ${height}`} role="group" aria-label="关键词词云">{layout.words.map((p,i)=><text key={p.word} x={p.x+p.width/2} y={p.y+p.height/2} textAnchor="middle" dominantBaseline="central" fontFamily="Geist, sans-serif" fontSize={p.size} fontWeight={600} fill={textColors[i%textColors.length]} role="button" tabIndex={0} onClick={()=>setSelected(p)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(p);}}}><title>{p.word} · {metric}: {p.value.toFixed(3)}</title>{p.word}</text>)}</svg>{!layout.words.length&&<p className="empty">没有可绘制的关键词。</p>}{layout.words.length<count&&<p className="graph-note">当前画布容纳 {layout.words.length} 个词</p>}{selected&&<p className="graph-note">{selected.word}：{selected.value.toFixed(3)}</p>}</div>;
}
