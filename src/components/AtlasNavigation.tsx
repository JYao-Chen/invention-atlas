'use client';
import {Database,Search,MessagesSquare,FileText,Settings,Files,PanelLeftOpen,PanelLeftClose,LogOut} from 'lucide-react';

export const atlasPages={data:'数据与证据',analysis:'查询工作台',history:'对话历史',reports:'报告库',settings:'模型与设置'};
type Page=keyof typeof atlasPages;
const icons={data:Database,analysis:Search,history:MessagesSquare,reports:FileText,settings:Settings};
const shortLabels={data:'数据',analysis:'查询',history:'对话',reports:'报告',settings:'设置'};

// Adapted from TallyBear's navigation rail; no financial or mascot components.
export default function AtlasNavigation({page,assistant,collapsed,onToggle,onNavigate,onAssistant,username,onLogout}:{page:Page;assistant:boolean;collapsed:boolean;onToggle:()=>void;onNavigate:(page:Page)=>void;onAssistant:()=>void;username:string;onLogout:()=>void}){
 return <>
<aside className="atlas-sidebar">
<div className="atlas-sidebar-top">
<a className="atlas-brand" href="/" aria-label="Invention Atlas 首页">
<Files size={30}/>

<span>
<strong>Invention Atlas</strong>
<small>专利分析与原文</small>
</span>
</a>
<button className="atlas-sidebar-toggle" aria-label={collapsed?'展开侧栏':'折叠侧栏'} aria-expanded={!collapsed} aria-controls="atlas-primary-navigation" onClick={onToggle}>{collapsed?<PanelLeftOpen size={19}/>
:<PanelLeftClose size={19}/>
}</button>
</div>
<nav id="atlas-primary-navigation" className="app-nav" aria-label="主导航">{(Object.keys(atlasPages) as Page[]).map(key=>{const Icon=icons[key];return <button key={key} data-page={key} aria-label={atlasPages[key]} title={atlasPages[key]} aria-current={!assistant&&page===key?'page':undefined} className={!assistant&&page===key?'active':''} onClick={()=>onNavigate(key)}>
<Icon size={20}/>

<span>{atlasPages[key]}</span>
</button>;})}<button data-page="assistant" className={assistant?'active':''} aria-current={assistant?'page':undefined} aria-label="分析助手" title="分析助手" onClick={onAssistant}>
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
<nav className="atlas-mobile-nav" aria-label="手机主导航">{(Object.keys(atlasPages) as Page[]).map(key=>{const Icon=icons[key];return <button key={key} data-page={key} aria-label={atlasPages[key]} aria-current={!assistant&&page===key?'page':undefined} className={!assistant&&page===key?'active':''} onClick={()=>onNavigate(key)}>
<Icon size={20}/>

<span>{shortLabels[key]}</span>
</button>;})}</nav>
</>
;
}
