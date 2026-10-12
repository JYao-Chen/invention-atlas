'use client';
type Feature={id:string;feature:string;role:string;quote:string;start:number;end:number};
export default function ProposalFeatures({features,disabled,onSave}:{features:Feature[];disabled:boolean;onSave:(features:Feature[])=>Promise<void>}){
 return <form className="professional-feature-editor" onSubmit={event=>{event.preventDefault();const fields=new FormData(event.currentTarget);void onSave(features.map(feature=>({...feature,feature:String(fields.get(feature.id+'-description')||'').trim(),role:String(fields.get(feature.id+'-role'))})));}}>
 <h3>核对技术特征</h3><p className="muted">修改特征描述或类型，原文引文保持不变。保存形成新版本后再确认。</p>
 {features.map(feature=><fieldset key={feature.id}><legend>{feature.id}</legend><label>特征描述<textarea name={feature.id+'-description'} defaultValue={feature.feature} required rows={2} disabled={disabled}/></label><label>类型<select name={feature.id+'-role'} defaultValue={feature.role} disabled={disabled}><option value="component">器件或组成</option><option value="step">步骤</option><option value="constraint">参数或限制</option><option value="relation">连接或配合关系</option></select></label><blockquote>{feature.quote}</blockquote><small className="muted">方案原文位置 {feature.start}—{feature.end}</small></fieldset>)}
 <button disabled={disabled}>保存特征修改</button>
 </form>;
}
