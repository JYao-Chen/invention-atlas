'use client';
import {useState} from 'react';
import type {ClusterMap,Row} from '@/lib/types';
const colors=['#3d6859','#936844','#57758f','#946b83','#797843','#5c8481','#826d54','#686d94'];
export default function ClusterView({map,rows,onPatent}:{map:ClusterMap;rows:Row[];onPatent:(id:string)=>void}){
 const [selected,setSelected]=useState(''),[filter,setFilter]=useState<number>();
 const point=map.points.find(p=>p.patent===selected);
 const xs=map.points.map(p=>p.x),ys=map.points.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 const x=(v:number)=>60+(v-minX)/(maxX-minX||1)*680,y=(v:number)=>420-(v-minY)/(maxY-minY||1)*380;
 return <div className="cluster-view"><p>每个点代表一项专利，颜色对应技术主题。点击主题筛选，点击专利点查看原文。</p><div className="cluster-legend"><button className={filter===undefined?'selected':''} onClick={()=>setFilter(undefined)}>全部 · {map.points.length}</button>{rows.map(row=><button key={Number(row.cluster)} className={filter===row.cluster?'selected':''} onClick={()=>setFilter(Number(row.cluster))}><span style={{background:colors[(Number(row.cluster)-1)%colors.length]}}/>{String(row.topic_name||'主题 '+row.cluster)} · {String(row.count)}</button>)}</div>
 <svg className="cluster-svg" viewBox="0 0 800 470" aria-label="技术主题聚类散点图"><rect width="800" height="470" fill="#f7f8f5"/><path d="M60 30V420H760" fill="none" stroke="#929c90"/><text x="380" y="455" fontSize="12" fill="#626963">主成分 1 · {(map.variance[0]*100).toFixed(1)}% 方差</text><text x="18" y="260" transform="rotate(-90 18 260)" fontSize="12" fill="#626963">主成分 2 · {(map.variance[1]*100).toFixed(1)}% 方差</text>{map.points.filter(p=>filter===undefined||p.cluster===filter).map(p=><circle key={p.patent} cx={x(p.x)} cy={y(p.y)} r={selected===p.patent?7:4.5} fill={colors[(p.cluster-1)%colors.length]} fillOpacity={.8} stroke={selected===p.patent?'#272c29':'#fff'} tabIndex={0} role="button" aria-label={p.patent+' · 主题 '+p.cluster} onClick={()=>setSelected(p.patent)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(p.patent);}}}><title>{p.patent} · {p.title} · 主题 {p.cluster}</title></circle>)}</svg>
 <p className="graph-note">PCA 二维投影保留 {((map.variance[0]+map.variance[1])*100).toFixed(1)}% 方差；K-means 在原始高维嵌入上计算。二维重叠不代表同一主题，图上距离仅供探索。</p>
 {point&&<div className="node-detail"><strong>{point.patent}</strong><span>{point.title} · {String(rows.find(row=>row.cluster===point.cluster)?.topic_name||'主题 '+point.cluster)}</span><button onClick={()=>onPatent(point.patent)}>查看专利原文</button></div>}
 <div className="cluster-topics">{rows.filter(row=>filter===undefined||row.cluster===filter).map(row=><p key={Number(row.cluster)}><strong>{String(row.topic_name||'主题 '+row.cluster)}</strong> · {String(row.keywords)}{Boolean(row.topic_explanation)&&<><br/>{String(row.topic_explanation)}</>}</p>)}</div></div>;
}
