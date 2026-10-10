'use client';
import Markdown from './MathMarkdown';
import type {AnalysisResult} from '@/lib/types';
import ResultView from './ResultView';
export default function PatentNarrative({text,results,onPatent,showMethods=false}:{text:string;results:AnalysisResult[];onPatent:(id:string,datasetId:string)=>void;showMethods?:boolean}){
 const used=new Set<string>();const parts=text.split(/(\[\[chart:[a-zA-Z0-9-]+\]\])/g);
 return <div className="patent-narrative">{parts.map((part,i)=>{const id=part.match(/^\[\[chart:([^\]]+)\]\]$/)?.[1];if(id){const result=results.find(r=>r.id===id);if(result&&!used.has(id)){used.add(id);return <ResultView key={id} result={result} showMethod={showMethods} onPatent={p=>onPatent(p,result.datasetId)}/>;}return result?null:<p key={i} className="muted">此图未保存在当前回答中。</p>;}return <div className="markdown" key={i}><Markdown>{part.replace(/\[\[chart:[^\]]*$/,'')}</Markdown></div>;})}{results.filter(r=>!used.has(r.id)).map(r=><ResultView key={r.id} result={r} showMethod={showMethods} onPatent={p=>onPatent(p,r.datasetId)}/>)}</div>;
}
