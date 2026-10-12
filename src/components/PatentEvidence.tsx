'use client';
import {useEffect,useRef} from 'react';
import type {Patent} from '../lib/types';
import {resolvePatentEvidence,type PatentEvidenceLocation} from '../lib/patent-evidence';
export default function PatentEvidence({patent,location}:{patent:Patent;location:PatentEvidenceLocation}){
 const mark=useRef<HTMLElement>(null),resolved=resolvePatentEvidence(patent,location);
 useEffect(()=>{mark.current?.scrollIntoView({block:'center'});},[patent.id,location]);
 return <section aria-label="引文定位"><h3>引文定位 · {location.section==='claim'?'权利要求原保存条目 '+location.claim:location.section==='abstract'?'摘要':'说明书'}</h3>{resolved?<pre className="original-text">{resolved.text.slice(0,resolved.start)}<mark ref={mark}>{resolved.text.slice(resolved.start,resolved.end)}</mark>{resolved.text.slice(resolved.end)}</pre>:<p role="alert">当前原文与该结果的引文位置不一致，未高亮。请查看保存的引用或重新分析。</p>}</section>;
}
