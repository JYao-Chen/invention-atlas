'use client';
import {useEffect,useState} from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {guideChapters,type HelpTarget} from '@/lib/help-guide';

export default function HelpManual({onOpen,onDemo}:{onOpen:(target:HelpTarget,tool?:string)=>void;onDemo:(question:string)=>void}){
 const [chapter,setChapter]=useState(guideChapters[0].id),[query,setQuery]=useState(''),[device,setDevice]=useState<'desktop'|'mobile'>('desktop');
 useEffect(()=>{const id=location.hash.replace('#guide/','');const saved=localStorage.getItem('atlas-guide-chapter');const resolved=guideChapters.find(c=>c.id===id)?.id||guideChapters.find(c=>c.id===saved)?.id||'start';setChapter(resolved);history.replaceState(null,'','#guide/'+resolved);setDevice(innerWidth<730?'mobile':'desktop');const update=()=>{const id=location.hash.replace('#guide/','');if(guideChapters.some(c=>c.id===id))setChapter(id);};addEventListener('hashchange',update);return()=>removeEventListener('hashchange',update);},[]);
 const current=guideChapters.find(c=>c.id===chapter)!;
 const matched=guideChapters.filter(c=>!query.trim()||`${c.title} ${c.intro} ${c.body}`.toLowerCase().includes(query.trim().toLowerCase()));
 function select(id:string){setChapter(id);localStorage.setItem('atlas-guide-chapter',id);history.replaceState(null,'','#guide/'+id);document.querySelector('.help-article')?.scrollIntoView({block:'start'});}
 return <div className="help-manual">
 <aside className="help-directory"><label>查找说明<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="关键词，例如索引、词云、删除"/></label>{[...new Set(matched.map(c=>c.group))].map(group=><section key={group}><h2>{group}</h2>{matched.filter(c=>c.group===group).map(c=><button key={c.id} aria-current={chapter===c.id?'page':undefined} onClick={()=>select(c.id)}>{c.title}</button>)}</section>)}{!matched.length&&<p>没有找到章节，试试更短的关键词。</p>}</aside>
 <article className="help-article" key={current.id}><p className="help-group">{current.group}</p><h2>{current.title}</h2><p>{current.intro}</p><div className="help-actions"><button onClick={()=>onOpen(current.target,current.tool)}>打开对应功能</button>{current.question&&<button className="primary" onClick={()=>onDemo(current.question!)}>带入演示问题</button>}<a href={'#guide/'+current.id} onClick={()=>select(current.id)}>本章链接</a></div>
 <nav aria-label="本章目录" className="help-section-links">{current.body.split('\n').filter(l=>l.startsWith('## ')).map((l,i)=><a key={i} href={'#section-'+current.id+'-'+i}>{l.slice(3)}</a>)}</nav>
 <Markdown remarkPlugins={[remarkGfm]} components={{h2:({children})=>{const sections=current.body.split('\n').filter(l=>l.startsWith('## ')).map(l=>l.slice(3));return <h3 id={'section-'+current.id+'-'+sections.indexOf(String(children))}>{children}</h3>;}}}>{current.body}</Markdown>
 {current.figure&&<figure className="help-figure"><div className="help-figure-controls"><button aria-pressed={device==='desktop'} onClick={()=>setDevice('desktop')}>电脑截图</button><button aria-pressed={device==='mobile'} onClick={()=>setDevice('mobile')}>手机截图</button><a href={`/help/${device}-${current.figure}.png`} target="_blank" rel="noreferrer">查看大图</a></div><a href={`/help/${device}-${current.figure}.png`} target="_blank" rel="noreferrer"><img src={`/help/${device}-${current.figure}.png`} alt={current.caption} loading="lazy"/></a><figcaption>{current.caption} 截图来自已有记录；不表示正在实时执行。</figcaption></figure>}
 <footer className="help-chapter-footer">{guideChapters.indexOf(current)>0&&<button onClick={()=>select(guideChapters[guideChapters.indexOf(current)-1].id)}>上一章</button>}{guideChapters.indexOf(current)<guideChapters.length-1&&<button onClick={()=>select(guideChapters[guideChapters.indexOf(current)+1].id)}>下一章</button>}</footer></article>
 </div>;
}
