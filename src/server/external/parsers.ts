import {StringDecoder} from 'node:string_decoder';
import {NumberNormalizer,patentNumber} from './patent-number';
export type Row=Record<string,string>;
/** Incremental RFC4180 parsing, including quoted tabs/newlines and chunk-split escaped quotes. */
export async function* delimited(input:AsyncIterable<Uint8Array|string>,separator=','):AsyncGenerator<string[]>{
 const decoder=new StringDecoder('utf8');let field='',row:string[]=[],quoted=false,afterQuote=false,size=0;
 function* consume(text:string){for(const c of text){
  if(++size>2_000_000)throw new Error('Delimited record exceeds 2 MB');
  if(quoted){if(c==='"'){quoted=false;afterQuote=true;}else field+=c;continue;}
  if(afterQuote&&c==='"'){field+='"';quoted=true;afterQuote=false;continue;}
  if(afterQuote&&c!==separator&&c!=='\r'&&c!=='\n')throw new Error('Unexpected character after closing quote');
  afterQuote=false;
  if(c==='"'&&!field){quoted=true;continue;}
  if(c===separator){row.push(field);field='';}
  else if(c==='\n'){row.push(field);if(row.some(Boolean))yield row;row=[];field='';size=0;}
  else if(c!=='\r')field+=c;
 }}
 for await(const chunk of input)yield* consume(typeof chunk==='string'?chunk:decoder.write(Buffer.from(chunk)));
 yield* consume(decoder.end());if(quoted)throw new Error('Unclosed quoted field');if(field||row.length){row.push(field);yield row;}
}
export async function* records(input:AsyncIterable<Uint8Array|string>,separator:string,required:string[]):AsyncGenerator<Row>{
 let headers:string[]|undefined;
 for await(const row of delimited(input,separator)){
  if(!headers){headers=row.map(x=>x.replace(/^\uFEFF/,'').trim());for(const name of required)if(!headers.includes(name))throw new Error('Missing column: '+name);continue;}
  if(row.length!==headers.length)throw new Error(`Expected ${headers.length} columns, got ${row.length}`);
  yield Object.fromEntries(headers.map((key,i)=>[key,row[i]]));
 }
 if(!headers)throw new Error('Missing header');
}
export function isoDate(value:string){if(!value)return null;const s=/^\d{8}$/.test(value)?`${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6)}`:value;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)throw new Error('Invalid source date: '+value);return s;}
export function numeric(value:string){if(value==='')return null;const n=Number(value);if(!Number.isFinite(n))throw new Error('Invalid source number');return n;}
export function workId(value:string){const m=/^(?:https:\/\/openalex.org\/)?W?(\d+)$/.exec(value);if(!m)throw new Error('Invalid OpenAlex work ID');return 'W'+m[1];}
export function paperLink(row:Row,n=new NumberNormalizer()){
 const flag=row.self_citation??row.selfcite;
 if(flag!==undefined&&!['','0','1','true','false'].includes(flag.toLowerCase()))throw new Error('Invalid self-citation flag');
 return {patent_number:n.normalize(row.patent),work_id:workId(row.oaid),confidence:numeric(row.confscore),reference_type:row.reftype,self_citation:flag===undefined||flag===''?null:['1','true'].includes(flag.toLowerCase()),where_found:row.wherefound};
}
/** ptmnfee2: patent, application, entity, filing date, issue date, event date, code. */
export function maintenanceLine(line:string,n=new NumberNormalizer()){
 const f=line.trim().split(/\s+/);if(f.length!==7||!/^\d{8}$/.test(f[5]))throw new Error('Unrecognized ptmnfee2 row format');
 return {patent_number:n.normalize(f[0]),event_date:isoDate(f[5])!,event_code:f[6],entity_type:f[2]};
}
export function patentRecord(row:Row,n=new NumberNormalizer()){
 const claims=numeric(row.num_claims);if(claims!==null&&(!Number.isInteger(claims)||claims<0))throw new Error('Invalid claim count');
 return {patent_number:n.normalize(row.patent_id),patent_type:patentNumber(row.patent_id).type,application_date:null as string|null,grant_date:isoDate(row.patent_date),cpc:[] as string[],assignees:[] as string[],assignee_countries:[] as string[],claims_count:claims};
}
export function openAlexPaper(work:Record<string,any>,retrievedAt:string){
 return {work_id:workId(work.id),doi:work.doi??null,title:work.title??null,year:work.publication_year??null,venue:work.primary_location?.source?.display_name??null,type:work.type??null,cited_by_count:work.cited_by_count??null,primary_topic:work.primary_topic??null,topics:work.topics??[],retrieved_at:retrievedAt};
}
