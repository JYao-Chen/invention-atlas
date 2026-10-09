'use client';
import {useEffect,useRef,useState} from 'react';
import {Database,Search,MessagesSquare,FileText,Settings,PanelLeftOpen,PanelLeftClose,LogOut,BookOpen,MoreHorizontal,X} from 'lucide-react';

export const atlasPages={data:'数据与证据',analysis:'查询工作台',history:'对话历史',reports:'报告库',settings:'模型与设置',help:'使用说明'};
type Page=keyof typeof atlasPages;
const icons={data:Database,analysis:Search,history:MessagesSquare,reports:FileText,settings:Settings,help:BookOpen};
const shortLabels={data:'数据',analysis:'查询',history:'对话',reports:'报告',settings:'设置',help:'说明'};
const navigationPages=(Object.keys(atlasPages) as Page[]).filter(key=>key!=='history');

// Adapted from TallyBear's navigation rail; no financial or mascot components.
export default function AtlasNavigation({page,assistant,collapsed,onToggle,onNavigate,onAssistant,username,onLogout}:{page:Page;assistant:boolean;collapsed:boolean;onToggle:()=>void;onNavigate:(page:Page)=>void;onAssistant:()=>void;username:string;onLogout:()=>void}){
 const [menuOpen,setMenuOpen]=useState(false);
 const menu=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const dialog=menu.current;if(!dialog)return;if(menuOpen&&!dialog.open)dialog.showModal();else if(!menuOpen&&dialog.open)dialog.close();},[menuOpen]);
 useEffect(()=>{const screen=matchMedia('(min-width:731px)');const close=()=>{if(screen.matches)setMenuOpen(false);};screen.addEventListener('change',close);return()=>screen.removeEventListener('change',close);},[]);
 const navigate=(key:Page)=>{setMenuOpen(false);onNavigate(key);};
 const openAssistant=()=>{setMenuOpen(false);onAssistant();};
 return <>
<aside className="atlas-sidebar">
<div className="atlas-sidebar-top">
<a className="atlas-brand" href="/" aria-label="Invention Atlas 首页">
<img className="atlas-logo" src="/brand/invention-atlas-mark.png" width={42} height={42} alt=""/>

<span>
<strong>Invention Atlas</strong>
<small>专利分析平台</small>
</span>
</a>
<button className="atlas-sidebar-toggle" aria-label={collapsed?'展开侧栏':'折叠侧栏'} aria-expanded={!collapsed} aria-controls="atlas-primary-navigation" onClick={onToggle}>{collapsed?<PanelLeftOpen size={19}/>
:<PanelLeftClose size={19}/>
}</button>
</div>
<nav id="atlas-primary-navigation" className="app-nav" aria-label="主导航">{navigationPages.map(key=>{const Icon=icons[key];return <button key={key} data-page={key} aria-label={atlasPages[key]} title={atlasPages[key]} aria-current={!assistant&&page===key?'page':undefined} className={!assistant&&page===key?'active':''} onClick={()=>onNavigate(key)}>
<Icon size={20}/>

<span>{atlasPages[key]}</span>
</button>;})}<button data-page="assistant" className={assistant||page==='history'?'active':''} aria-current={assistant||page==='history'?'page':undefined} aria-label="分析助手" title="分析助手" onClick={onAssistant}>
<MessagesSquare size={20}/>

<span>分析助手</span>
</button>
</nav>
<div className="atlas-sidebar-account">
<span>{username}</span>
<button aria-label="退出登录" title="退出登录" onClick={onLogout}>
<LogOut size={18}/>

<span>退出登录</span>
</button>
</div>
</aside>
<nav className="atlas-mobile-nav" aria-label="手机主导航">
{(['data','analysis'] as Page[]).map(key=>{const Icon=icons[key];return <button key={key} data-page={key} aria-label={atlasPages[key]} aria-current={!assistant&&page===key?'page':undefined} className={!assistant&&page===key?'active':''} onClick={()=>navigate(key)}><Icon size={21}/><span>{shortLabels[key]}</span></button>;})}
<button data-page="assistant" className={`atlas-mobile-assistant${assistant||page==='history'?' active':''}`} aria-label="分析助手" aria-current={assistant||page==='history'?'page':undefined} onClick={openAssistant}><MessagesSquare size={21}/><span>助手</span></button>
<button data-page="reports" aria-label="报告库" aria-current={!assistant&&page==='reports'?'page':undefined} className={!assistant&&page==='reports'?'active':''} onClick={()=>navigate('reports')}><FileText size={21}/><span>报告</span></button>
<button className={menuOpen||(!assistant&&['reports','settings','help'].includes(page))?'active':''} aria-label="更多功能" aria-haspopup="dialog" aria-expanded={menuOpen} aria-controls="atlas-mobile-menu" onClick={()=>setMenuOpen(true)}><MoreHorizontal size={21}/><span>更多</span></button>
</nav>
<dialog ref={menu} id="atlas-mobile-menu" className="atlas-mobile-menu" aria-labelledby="atlas-mobile-menu-title" onCancel={()=>setMenuOpen(false)} onClose={()=>setMenuOpen(false)} onClick={e=>{if(e.target===e.currentTarget)setMenuOpen(false);}}>
<section className="atlas-mobile-menu-body">
<div className="atlas-mobile-menu-heading"><h2 id="atlas-mobile-menu-title">全部功能</h2><button type="button" aria-label="关闭功能菜单" onClick={()=>setMenuOpen(false)}><X size={22}/></button></div>
<nav className="atlas-mobile-menu-links" aria-label="全部功能">{navigationPages.map(key=>{const Icon=icons[key];return <button key={key} aria-current={!assistant&&page===key?'page':undefined} className={!assistant&&page===key?'active':''} onClick={()=>navigate(key)}><Icon size={22}/><span>{atlasPages[key]}</span></button>;})}<button className={assistant||page==='history'?'active':''} aria-current={assistant||page==='history'?'page':undefined} onClick={openAssistant}><MessagesSquare size={22}/><span>分析助手</span></button></nav>
<div className="atlas-mobile-menu-account"><span>{username}</span><button type="button" onClick={()=>{setMenuOpen(false);onLogout();}}><LogOut size={18}/><span>退出登录</span></button></div>
</section>
</dialog>
</>
;
}
