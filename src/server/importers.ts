import {XMLParser} from 'fast-xml-parser';
import {randomUUID} from 'node:crypto';
import type {Patent,Dataset,Claim} from '@/lib/types';

export const cleanId=(v:string)=>v.toUpperCase().replace(/[^A-Z0-9]/g,'');
const list=(v:unknown):string[]=>Array.isArray(v)?v.map(x=>typeof x==='string'?x:String((x as Record<string,unknown>).name||'')).filter(Boolean):typeof v==='string'?v.split(/[;\n]/).map(x=>x.trim()).filter(Boolean):[];
const text=(v:unknown):string=>typeof v==='string'?v:Array.isArray(v)?text(v.find((x:{language?:string})=>x.language==='en')||v[0]):v&&typeof v==='object'?String((v as Record<string,unknown>).text||''):'';
export function date(v:unknown){const s=String(v||'');return /^\d{8}$/.test(s)?`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`:/^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10):'';}
export function normalize(row:Record<string,unknown>,origin:string):Patent{
 const id=cleanId(String(row.id||row.publication_number||row.patent_number||''));if(!id)throw new Error('缺少公开编号');
 const claims=Array.isArray(row.claims)&&row.claims.every(x=>typeof x==='object'&&x!==null)?row.claims as Claim[]:text(row.claims_localized||row.claims)?[{number:1,text:text(row.claims_localized||row.claims)}]:[];
 const classification=(v:unknown)=>Array.isArray(v)?v.map(x=>typeof x==='string'?x:String((x as {code?:string}).code||'')):list(v);
 return {id,title:text(row.title_localized||row.title),abstract:text(row.abstract_localized||row.abstract),applicants:list(row.applicants||row.applicant),assignees:list(row.assignees||row.assignee),inventors:list(row.inventors||row.inventor),publicationDate:date(row.publicationDate||row.publication_date),filingDate:date(row.filingDate||row.filing_date),ipc:classification(row.ipc),cpc:classification(row.cpc),claims,description:text(row.description_localized||row.description),citations:list(row.citations||((row.citation as {publication_number:string}[]|undefined)||[]).map(x=>x.publication_number)).map(cleanId),familyId:String(row.familyId||row.family_id||''),familyMembers:list(row.familyMembers||row.family_members).map(cleanId),legalStatus:String(row.legalStatus||row.legal_status||''),legalAsOf:date(row.legalAsOf||row.legal_status_as_of),sourceName:String(row.sourceName||origin),sourceUrl:String(row.sourceUrl||`https://patents.google.com/patent/${id}/en`),publicEvidence:row.publicEvidence as Patent['publicEvidence'],rawText:String(row.rawText||''),locations:(row.locations||{}) as Patent['locations']};
}
export function dltPatent(row:Record<string,unknown>):Patent{
 const raw=String(row.text||'');const locations:Patent['locations']={};
 function section(label:string){const pattern=new RegExp(`^#{1,6} ${label}\\s*$`,'mi');const hit=pattern.exec(raw);if(!hit)return '';const start=hit.index+hit[0].length;const next=/^#{1,3} /m.exec(raw.slice(start));const end=next?start+next.index:raw.length;locations[label]={start,end};return raw.slice(start,end).trim();}
 const abstractBlock=section('Abstract');const metadataStart=/^(?:Inventors?|Applicant|Family ID|Assignee|Appl\. No\.|Filed):\s*$/m.exec(abstractBlock)?.index;
 const abstract=(metadataStart===undefined?abstractBlock:abstractBlock.slice(0,metadataStart)).trim();const claimsText=section('Claims');
 if(locations.Abstract)locations.Abstract.end=locations.Abstract.start+raw.slice(locations.Abstract.start).indexOf(abstract)+abstract.length;
 function roleNames(label:string,fallback:unknown){const match=new RegExp(`^${label}:\\s*\\n([\\s\\S]*?)(?=\\n(?:Inventors?|Applicant|Family ID|Assignee|Appl\\. No\\.|Filed):|\\n### |$)`,'m').exec(raw);const names=match?[...match[1].matchAll(/\*\*([^*]+)\*\*/g)].map(m=>m[1].trim()):[];return names.length?names:typeof fallback==='string'&&fallback.trim()?[fallback.trim()]:list(fallback);}
 const description=[section('Background/Summary'),section('Description'),section('Detailed Description')].filter(Boolean).join('\n\n');
 const ipcBlock=/Int\. Cl\.:([\s\S]*?)(?:U\.S\. Cl\.:|### |$)/i.exec(raw)?.[1]||'';
 const ipc=[...ipcBlock.matchAll(/\b([A-H]\d{2}[A-Z]\s*\d+\s*\/\s*\d+)/g)].map(m=>m[1].replace(/\s/g,''));
 const claimParts=claimsText.split(/(?=^\s*\d+\.\s)/m).filter(x=>x.trim());
 const claims=claimParts.map((part,index)=>{const start=raw.indexOf(part,locations.Claims?.start||0);return {number:Number(/^\s*(\d+)\./.exec(part)?.[1]||index+1),text:part.trim(),sourceStart:start,sourceEnd:start+part.length};});
 const citesBlock=/### References Cited([\s\S]*?)(?:### Background|### Description|### Claims|$)/.exec(raw)?.[1]||'';
 const usBlock=/#### U\.S\. PATENT DOCUMENTS([\s\S]*?)(?:#### |$)/.exec(citesBlock)?.[1]||'';
 const citations=[...usBlock.matchAll(/^\s*(\d{4}\/\d{7}|\d{6,8})\s*(?:[AB]\d)?\s*$/gm)].map(m=>'US'+m[1].replace('/',''));
 const p=normalize({id:row['Document ID'],title:row.Title,abstract,applicants:roleNames('Applicant',row['Applicant Name']),assignees:roleNames('Assignee',row.Assignee),inventors:roleNames('Inventors?',row.Inventor),publicationDate:row['Date Published'],filingDate:row['Filing Date'],ipc:[...new Set(ipc)],cpc:list(row.CPCI).concat(list(row.CPCA)),claims,description,familyId:row['Family ID'],citations,rawText:raw,locations,sourceName:'ExponentialScience / DLT-Patents · USPTO 全文整理'},'DLT-Patents');
 return p;
}
const array=(v:unknown):unknown[]=>v===undefined?[]:Array.isArray(v)?v:[v];
function xmlText(v:unknown):string{if(v===undefined||v===null)return '';if(typeof v!=='object')return String(v);return Object.entries(v).filter(([key])=>!key.startsWith('@_')).map(([,value])=>Array.isArray(value)?value.map(xmlText).join(' '):xmlText(value)).join(' ').replace(/\s+/g,' ').trim();}
function find(v:unknown,key:string):unknown[]{if(!v||typeof v!=='object')return [];return Object.entries(v).flatMap(([k,x])=>k===key?array(x):array(x).flatMap(t=>find(t,key)));}
export function importText(body:string,format:string,origin:string):Patent[]{
 if(format==='canonical'||format==='google')return body.split(/\r?\n/).filter(x=>x.trim()).map(line=>normalize(JSON.parse(line),origin));
 if(format==='dlt')return body.split(/\r?\n/).filter(x=>x.trim()).map(line=>dltPatent(JSON.parse(line)));
 if(format==='xml'){
  const parser=new XMLParser({ignoreAttributes:false,parseTagValue:false,processEntities:false});
  return body.split(/(?=<\?xml\s)/).filter(x=>/<us-patent-(?:grant|application)\b/.test(x)).flatMap(chunk=>{
   const root=parser.parse(chunk);return [...find(root,'us-patent-grant'),...find(root,'us-patent-application')].map(grant=>{const g=grant as Record<string,unknown>;const doc=find(find(g,'publication-reference')[0],'document-id')[0] as Record<string,unknown>||{};
    const name=(role:string)=>[...find(g,role),...find(g,'us-'+role)].map(p=>{const a=find(p,'addressbook')[0] as Record<string,unknown>||p as Record<string,unknown>;return xmlText(a['orgname'])||[xmlText(a['first-name']),xmlText(a['last-name'])].filter(Boolean).join(' ');});
    const claims=find(g,'claim').map((c,i)=>({number:Number((c as Record<string,unknown>)['@_num']||i+1),text:xmlText(c)}));
    const ipc=find(g,'classification-ipcr').map(c=>{const x=c as Record<string,unknown>;return ['section','class','subclass'].map(k=>xmlText(x[k])).join('')+xmlText(x['main-group'])+'/'+xmlText(x.subgroup);});
    const application=find(find(g,'application-reference')[0],'document-id')[0] as Record<string,unknown>||{};
    const citations=find(g,'patcit').map(c=>{const d=find(c,'document-id')[0] as Record<string,unknown>||{};return xmlText(d.country)+xmlText(d['doc-number'])+xmlText(d.kind);});
    return normalize({id:xmlText(doc.country)+xmlText(doc['doc-number'])+xmlText(doc.kind),title:xmlText(find(g,'invention-title')[0]),abstract:xmlText(find(g,'abstract')[0]),description:xmlText(find(g,'description')[0]),claims,applicants:name('applicant'),assignees:name('assignee'),inventors:name('inventor'),publicationDate:doc.date,filingDate:application.date,ipc,citations,rawText:chunk,sourceName:origin},origin);
   });
  });
 }
 if(format==='wos')return body.split(/\r?\nER\s*(?:\r?\n|$)/).filter(x=>/^PT /m.test(x)).map(block=>{
  const fields:Record<string,string>={};let key='';for(const line of block.split(/\r?\n/)){const m=/^([A-Z]{2}) (.*)$/.exec(line);if(m){key=m[1];fields[key]=m[2];}else if(/^   /.test(line)&&key)fields[key]+=';'+line.trim();}
  const p=normalize({id:fields.PN?.split(';')[0],title:fields.TI,abstract:fields.AB,assignees:fields.AE,inventors:fields.AU,ipc:fields.IP,citations:fields.CP,rawText:block,sourceName:origin},origin);
  const parsed=new Date(fields.PD?.replace(/^[A-Z]{2}\S+\s+/,''));if(!isNaN(parsed.getTime()))p.publicationDate=parsed.toISOString().slice(0,10);return p;
 });
 throw new Error('不支持的导入格式');
}
export function datasetMeta(name:string,records:Patent[],source:string,sampling:string):Dataset{
 const coverage=Object.fromEntries(['title','abstract','applicants','publicationDate','ipc','cpc','claims','description','citations','familyId','familyMembers','legalStatus'].map(key=>[key,records.length?records.filter(p=>{const v=p[key as keyof Patent];return key==='description'&&'deferredText' in p?Boolean((p as import('@/lib/types').AnalysisPatent).deferredText?.descriptionChars):Array.isArray(v)?v.length>0:Boolean(v);}).length/records.length:0]));
 return {id:randomUUID(),name,createdAt:new Date().toISOString(),count:records.length,source,sampling,coverage,years:[...new Set(records.map(p=>p.publicationDate.slice(0,4)).filter(Boolean))].sort(),warnings:['当前数据仅代表导入语料，不能据此推断整个行业的专利总量。',...(!coverage.legalStatus?['缺少来源时点法律状态，不代表目前有效或失效。']:[]),...(!coverage.familyMembers?['只有同族标识，缺少完整同族成员和各国权利状态。']:[])],indexed:records.filter(p=>p.embedding?.length).length};
}
