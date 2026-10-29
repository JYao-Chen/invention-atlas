'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {RefreshCw} from 'lucide-react';

export type ModelSettingsData={model:string;embedding:string;configured:boolean;dimensions:number;username:string;base:string};
type Request=(path:string,body?:unknown,method?:string)=>Promise<any>;

// Chat model form, embedding facts and account details on the settings page. The form resets whenever saved settings change.
export default function ModelSettings({settings,request,disabled,pending,setPending,onSaved,onError,onNotice,usage}:{settings:ModelSettingsData;request:Request;disabled:boolean;pending:boolean;setPending:(value:boolean)=>void;onSaved:(settings:ModelSettingsData)=>void;onError:(message:string)=>void;onNotice:(message:string)=>void;usage?:ReactNode}){
 const [modelForm,setModelForm]=useState({model:settings.model,base:settings.base,apiKey:''});
 useEffect(()=>{setModelForm({model:settings.model,base:settings.base,apiKey:''});},[settings]);
 return <>
<h2>对话模型</h2>
<p className="muted">用于任务规划和报告生成，支持 OpenAI 兼容接口。</p>
<form className="settings-panel model-form" onSubmit={async e=>{e.preventDefault();onError('');onNotice('');setPending(true);try{const saved=await request('settings',modelForm,'PATCH');onSaved(saved);setModelForm({model:saved.model,base:saved.base,apiKey:''});onNotice('模型配置已保存，下次分析将使用新配置。');}catch(e){onError((e as Error).message);}finally{setPending(false);}}}>
<label>模型名称<input name="model" value={modelForm.model} onChange={e=>setModelForm({...modelForm,model:e.target.value})} placeholder="例如 qwen3.8-flash" required disabled={disabled}/>
</label>
<label>接口地址<input name="base" type="url" value={modelForm.base} onChange={e=>setModelForm({...modelForm,base:e.target.value})} placeholder="https://…/v1" required disabled={disabled}/>
</label>
<label>API Key<input name="apiKey" type="password" autoComplete="new-password" value={modelForm.apiKey} onChange={e=>setModelForm({...modelForm,apiKey:e.target.value})} placeholder={settings.configured?'已配置，留空保留现有密钥':'输入模型服务的 API Key'} disabled={disabled}/>
<span className="field-help">密钥仅保存在服务端，不会在页面回显。</span>
</label>
<div className="settings-actions">
<button className="primary" disabled={disabled}>{pending?'正在处理…':'保存配置'}</button>
<button type="button" disabled={disabled||!modelForm.model.trim()||!modelForm.base.trim()} onClick={async()=>{onError('');onNotice('');setPending(true);try{const tested=await request('settings',modelForm);onNotice('连接正常：'+tested.model+'。测试不会保存配置。');}catch(e){onError((e as Error).message);}finally{setPending(false);}}}>
<RefreshCw size={16}/>
测试连接</button>
</div>
<p>保存后无需重启。已有对话记录和报告不会改写。</p>
</form>
<section className="settings-panel embedding-settings">
<h3>语义检索</h3>
<dl>
<dt>嵌入模型</dt>
<dd>{settings.embedding}</dd>
<dt>向量维度</dt>
<dd>{settings.dimensions}</dd>
</dl>
<p>现有索引使用此嵌入配置。对话模型的修改不会影响它；更换嵌入模型需重新建立索引。</p>
</section>
{usage}
<details className="settings-environment">
<summary>账号与运行环境</summary>
<dl>
<dt>登录账号</dt>
<dd>{settings.username}</dd>
<dt>运行方式</dt>
<dd>Next.js 与 PostgreSQL</dd>
</dl>
</details>
</>;
}
