import type {Patent,PublicEvidence} from '@/lib/types';
export function htmlText(input:string){return input.replace(/<[^>]*>/g,' ').replace(/&(amp|lt|gt|quot|apos|nbsp);/g,(_,key)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[key as string]!)).replace(/&#(x[0-9a-f]+|\d+);/gi,(_,code)=>String.fromCodePoint(parseInt(code.replace(/^x/i,''),/^x/i.test(code)?16:10))).replace(/\s+/g,' ').trim();}
function property(html:string,name:string){const match=new RegExp(`<([a-z][a-z0-9]*)\\b[^>]*itemprop="${name}"[^>]*>([\\s\\S]*?)<\\/\\1>`,'i').exec(html);return match?htmlText(match[2]):'';}
export function parseGoogleEvidence(html:string,id:string,retrievedAt:string):{status:string;evidence:PublicEvidence}{
 const publication=property(html,'publicationNumber');
 if(publication.replace(/[^a-z0-9]/gi,'').toUpperCase()!==id)throw new Error(`页面公开编号不匹配：${id} / ${publication}`);
 const legal=/<dd[^>]*itemprop="legalStatusIfi"[^>]*>([\s\S]*?)<\/dd>/i.exec(html)?.[1]||'',status=property(legal,'status');
 const familyTable=/<h2>Family Applications\s*\((\d+)\)<\/h2>\s*<table>([\s\S]*?)<\/table>/i.exec(html);
 const familyApplications=[...(familyTable?.[2]||'').matchAll(/<tr[^>]*itemprop="applications"[^>]*>([\s\S]*?)<\/tr>/gi)].map(match=>({application:property(match[1],'applicationNumber'),publication:property(match[1],'representativePublication'),status:property(match[1],'ifiStatus'),priorityDate:property(match[1],'priorityDate'),filingDate:property(match[1],'filingDate')}));
 if(familyTable&&familyApplications.length!==Number(familyTable[1]))throw new Error(`${id}：同族申请表不完整`);
 if(familyApplications.some(p=>!p.application||!/^([A-Z]{2})[A-Z]?\d+[A-Z]\d?$/.test(p.publication)))throw new Error(`${id}：同族代表公开件缺少编号`);
 const regionTable=/<h2>Country Status\s*\((\d+)\)<\/h2>\s*<table>([\s\S]*?)<\/table>/i.exec(html);
 const familyRegions=[...(regionTable?.[2]||'').matchAll(/<tr[^>]*itemprop="countryStatus"[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>({office:property(m[1],'countryCode'),publication:property(m[1],'representativePublication')}));
 if(regionTable&&familyRegions.length!==Number(regionTable[1]))throw new Error(`${id}：同族公开局代表表不完整`);
 if(familyRegions.some(p=>!/^([A-Z]{2})[A-Z]?\d+[A-Z]\d?$/.test(p.publication)||p.publication.slice(0,2)!==p.office))throw new Error(`${id}：公开局与代表编号不一致`);
 const legalEvents=[...html.matchAll(/<tr[^>]*itemprop="legalEvents"[^>]*>([\s\S]*?)<\/tr>/gi)].map(match=>({date:/<time[^>]*datetime="(\d{4}-\d{2}-\d{2})"/.exec(match[1])?.[1]||'',code:property(match[1],'code'),title:property(match[1],'title'),details:[...match[1].matchAll(/<p[^>]*itemprop="attributes"[^>]*>([\s\S]*?)<\/p>/gi)].map(m=>htmlText(m[1])).join('; '),htmlStart:match.index!}));
 if(legalEvents.some(e=>!e.date||!e.code||!e.title))throw new Error(`${id}：法律事件字段不完整`);
 const familySection=/<section[^>]*itemprop="family"[^>]*>\s*<h1>Family<\/h1>\s*<h2>ID=(\d+)<\/h2>/i.exec(html);
 return {status,evidence:{sourceUrl:`https://patents.google.com/patent/${id}/en`,sourceName:'Google Patents 公共页面',retrievedAt,statusBasis:'第三方页面状态推定；日期是页面获取时点，不是官方确认时点',statusDisclaimer:'Google声明状态是推定而非法律结论，未进行法律分析，不保证所列状态准确。',familyDefinition:'Google Patents Family Applications及Country Status：各申请及公开局代表公开件；不含所有公开版本，不承诺完整全球同族',familyId:familySection?.[1]||'',familyApplications,familyRegions,legalEvents}};
}
export function enrichPatent(p:Patent,html:string,retrievedAt:string):Patent{
 const {status,evidence}=parseGoogleEvidence(html,p.id,retrievedAt);
 return {...p,legalStatus:status,legalAsOf:status?retrievedAt.slice(0,10):'',familyMembers:[...new Set([...evidence.familyApplications,...evidence.familyRegions||[]].map(p=>p.publication))],publicEvidence:evidence};
}
