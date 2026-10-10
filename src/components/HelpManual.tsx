'use client';
import {useEffect,useState} from 'react';
import Markdown from './MathMarkdown';
import {guideChapters,type HelpTarget,type GuideSection} from '@/lib/help-guide';

function ManualFigure({section,device,onDevice}:{section:GuideSection;device:'desktop'|'mobile';onDevice:(device:'desktop'|'mobile')=>void}){
 const src=`/help/${device}-${section.figure}.png`;
 return <figure className="help-figure"><div className="help-figure-controls"><button aria-pressed={device==='desktop'} onClick={()=>onDevice('desktop')}>电脑截图</button><button aria-pressed={device==='mobile'} onClick={()=>onDevice('mobile')}>手机截图</button><a href={src} target="_blank" rel="noreferrer">查看大图</a></div><a href={src} target="_blank" rel="noreferrer"><img src={src} alt={section.caption} loading="lazy"/></a><figcaption>{section.caption}</figcaption></figure>;
}
export default function HelpManual({onOpen,onDemo,toolsReady}:{onOpen:(target:HelpTarget,tool?:string)=>void;onDemo:(question:string)=>void;toolsReady:boolean}){
 const [chapter,setChapter]=useState(guideChapters[0].id),[query,setQuery]=useState(''),[device,setDevice]=useState<'desktop'|'mobile'>('desktop');
 useEffect(()=>{const id=location.hash.replace('#guide/','');const saved=localStorage.getItem('atlas-guide-chapter');const resolved=guideChapters.find(c=>c.id===id)?.id||guideChapters.find(c=>c.id===saved)?.id||'start';setChapter(resolved);history.replaceState(null,'','#guide/'+resolved);setDevice(innerWidth<730?'mobile':'desktop');const update=()=>{const id=location.hash.replace('#guide/','');if(guideChapters.some(c=>c.id===id))setChapter(id);};addEventListener('hashchange',update);return()=>removeEventListener('hashchange',update);},[]);
 const current=guideChapters.find(c=>c.id===chapter)!;
 const matched=guideChapters.filter(c=>!query.trim()||`${c.title} ${c.intro} ${c.body}`.toLowerCase().includes(query.trim().toLowerCase()));
 function select(id:string){setQuery('');setChapter(id);localStorage.setItem('atlas-guide-chapter',id);history.replaceState(null,'','#guide/'+id);document.querySelector('.help-article')?.scrollIntoView({block:'start'});}
 return <div className="help-manual">
 <aside className="help-directory"><label>查找说明<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="功能名称或方法，例如生命周期、共引"/></label>
 <label className="help-mobile-chapters">章节目录<select value={chapter} onChange={e=>{setQuery('');select(e.target.value);}}>{!matched.some(c=>c.id===chapter)&&<option value={chapter} disabled>选择搜索结果</option>}{matched.map(c=><option key={c.id} value={c.id}>{c.number} {c.title}</option>)}</select></label>
 <nav className="help-desktop-chapters" aria-label="说明章节">{[...new Set(matched.map(c=>c.group))].map(group=><section key={group}><h2>{group}</h2>{matched.filter(c=>c.group===group).map(c=><button key={c.id} aria-current={chapter===c.id?'page':undefined} onClick={()=>select(c.id)}><span className="help-number">{c.number}</span>{c.title}</button>)}</section>)}</nav>{!matched.length&&<p>没有找到章节。</p>}</aside>
 <article className="help-article" key={current.id}><p className="help-group">{current.group} · {current.number} / {guideChapters.length}</p><h2>{current.number} {current.title}</h2><p className="help-lead">{current.intro}</p><div className="help-actions"><button disabled={Boolean(current.tool)&&!toolsReady} title={current.tool&&!toolsReady?'正在加载工具目录':undefined} onClick={()=>onOpen(current.target,current.tool)}>打开对应功能</button><button onClick={()=>onDemo(`请介绍“${current.title}”功能在专利挖掘中的用途、计算方法和操作步骤，以及结果应如何解释。`)}>询问助手</button>{current.question&&<button className="primary" onClick={()=>onDemo(current.question!)}>使用示例问题</button>}<a href={'#guide/'+current.id} onClick={()=>select(current.id)}>本章链接</a></div>
 <nav aria-label="本章目录" className="help-section-links">{current.sections.map((section,i)=><a key={i} href={'#section-'+current.id+'-'+i}>{section.title}</a>)}</nav>
 {current.sections.map((section,i)=><section className="help-reading-section" id={'section-'+current.id+'-'+i} key={section.title}><h3>{section.title}</h3><Markdown>{section.body}</Markdown>{section.figure&&<ManualFigure section={section} device={device} onDevice={setDevice}/>}</section>)}
 <footer className="help-chapter-footer">{guideChapters.indexOf(current)>0&&<button onClick={()=>select(guideChapters[guideChapters.indexOf(current)-1].id)}>上一章</button>}{guideChapters.indexOf(current)<guideChapters.length-1&&<button onClick={()=>select(guideChapters[guideChapters.indexOf(current)+1].id)}>下一章</button>}</footer></article>
 </div>;
}
