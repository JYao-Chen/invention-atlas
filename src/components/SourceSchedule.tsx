'use client';
import {useEffect,useRef,useState} from 'react';
type Schedule={id:string;enabled:boolean;interval_hours:number;next_run_at:string;last_run_id:string|null;params:{datasetId:string;offset:number;batches:number;query:string}};
export default function SourceSchedule({datasetId,readOnly}:{datasetId:string;readOnly:boolean}){
 const [schedule,setSchedule]=useState<Schedule>(),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[retry,setRetry]=useState(0);
 const action=useRef<AbortController|null>(null);
 useEffect(()=>()=>action.current?.abort(),[]);
 useEffect(()=>{
  const control=new AbortController();setLoaded(false);setSchedule(undefined);setError('');setNotice('');
  void fetch('/api/source-schedules',{signal:control.signal}).then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.error||'无法读取定时采集配置');if(!control.signal.aborted){setSchedule(body.schedules.find((item:Schedule)=>item.params.datasetId===datasetId));setLoaded(true);}}).catch(e=>{if(!control.signal.aborted)setError(e.message);});
  return()=>{control.abort();action.current?.abort();};
 },[datasetId,retry]);
 async function save(values:FormData){
  if(action.current)return;const control=new AbortController();action.current=control;setBusy(true);setError('');setNotice('');
  try{
   const response=await fetch('/api/source-schedules',{method:'POST',signal:control.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({params:{datasetId,offset:Number(values.get('offset')),batches:Number(values.get('batches')),query:String(values.get('query')||'').trim()},intervalHours:Number(values.get('interval')),enabled:values.get('enabled')==='on'})});
   const body=await response.json();if(!response.ok)throw new Error(body.error||'无法保存定时采集配置');if(control.signal.aborted)return;
   setSchedule(body);setNotice(body.enabled?'定时采集已启用。后台将按配置读取来源窗口。':'定时采集已暂停。已提交的任务不会因此取消。');
  }catch(e){if(!control.signal.aborted)setError((e as Error).message);}
  finally{if(action.current===control){action.current=null;setBusy(false);}}
 }
 return <section aria-label="定时来源采集">
  <h4>定时来源采集</h4>
  <p className="muted">定期重新读取指定窗口。来源内容与手工修订冲突时，等待确认后再继续自动采集。</p>
  {!loaded&&!error&&<p role="status">正在读取采集配置…</p>}
  {error&&<p className="error" role="alert">{error} {!loaded&&<button type="button" onClick={()=>setRetry(value=>value+1)}>重新读取</button>}</p>}
  {loaded&&<>
   <p>{schedule?(schedule.enabled?'已启用':'已暂停'):'尚未配置'}{schedule?.enabled&&` · 下次检查 ${new Date(schedule.next_run_at).toLocaleString('zh-CN')}`}</p>
   {readOnly?<p className="muted">{schedule?`源位置 ${schedule.params.offset} · ${schedule.params.batches} 批 · 每 ${schedule.interval_hours} 小时 · ${schedule.params.query||'未设置筛选词'}`:'当前项目为只读，请联系分析成员配置。'}</p>:<form key={datasetId+':'+(schedule?.id||'new')} onSubmit={event=>{event.preventDefault();void save(new FormData(event.currentTarget));}}>
    <fieldset disabled={busy}>
     <label>定时起始源位置<input name="offset" type="number" min={0} max={49024} step={1} required defaultValue={schedule?.params.offset??10000}/></label>
     <label>定时批次数<input name="batches" type="number" min={1} max={10} step={1} required defaultValue={schedule?.params.batches??1}/></label>
     <label>采集间隔（小时）<input name="interval" type="number" min={1} max={8760} step={1} required defaultValue={schedule?.interval_hours??24}/></label>
     <label>定时英文筛选词（可留空）<input name="query" maxLength={2000} defaultValue={schedule?.params.query??''}/></label>
    </fieldset>
    <div className="record-actions"><label className="source-schedule-enabled"><input name="enabled" type="checkbox" disabled={busy} defaultChecked={schedule?.enabled??false}/>启用定时采集</label><button disabled={busy}>{busy?'正在保存…':'保存采集配置'}</button></div>
   </form>}
  </>}
  {notice&&<p role="status">{notice}</p>}
 </section>;
}
