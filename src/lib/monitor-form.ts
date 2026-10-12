import type {Params} from './types';

export function monitorParamsFromForm(values:FormData):Params{
 const counting=values.get('counting');if(counting!=='publication'&&counting!=='family')throw new Error('请选择公开件或同族代表件计数口径');
 return {query:String(values.get('query')||'').trim(),strategy_id:String(values.get('strategy_id')||'').trim(),top_k:Number(values.get('top_k')),counting,
  ...Object.fromEntries(['year_start','year_end','applicant','ipc'].filter(key=>String(values.get(key)||'').trim()).map(key=>[key,key.startsWith('year_')?Number(values.get(key)):String(values.get(key)).trim()]))};
}
