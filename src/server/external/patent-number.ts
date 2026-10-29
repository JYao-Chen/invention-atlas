/** Kind codes identify publications, while the reference key identifies a grant or application publication. */
export type PatentNumber={raw:string;canonical:string;recognized:boolean;type:'utility'|'application'|'design'|'reissue'|'plant'|'statutory'|'defensive'|'unknown';number:string;prefix:string;kind:string};
export function patentNumber(raw:string):PatentNumber{
 const unknown:PatentNumber={raw,canonical:raw,recognized:false,type:'unknown',number:'',prefix:'',kind:''};
 let value=raw.trim().toUpperCase().replace(/^US[\s-]*/,'').replace(/[\s,./-]/g,'');
 const match=/^(RE|PP|D|H|T)?(\d+)([A-Z]\d?)?$/.exec(value);if(!match)return unknown;
 const prefix=match[1]||'',kind=match[3]||'';let number=match[2].replace(/^0+(?=\d)/,'');
 if(number==='0')return unknown;
 const types:Record<string,PatentNumber['type']>={D:'design',RE:'reissue',PP:'plant',H:'statutory',T:'defensive'};
 let type:PatentNumber['type']=types[prefix]||'utility';
 if(!prefix&&/^(19|20)\d{7,9}$/.test(number)){
  if(kind&&!/^A[129]?$/.test(kind))return unknown;
  number=number.slice(0,4)+number.slice(4).padStart(7,'0');type='application';
 }else if(number.length>(prefix?7:8)||kind&&!(prefix?/^[A-Z]\d?$/:/^[ABC]\d?$/).test(kind))return unknown;
 return {raw,canonical:'US'+prefix+number,recognized:true,type,number,prefix,kind};
}
export const normalizePatentNumber=(raw:string)=>patentNumber(raw).canonical;
export function toPatentsView(raw:string){const n=patentNumber(raw);return n.recognized?n.prefix+n.number:raw;}
export function toRelianceOnScience(raw:string){const n=patentNumber(raw);return n.recognized?'us-'+n.prefix.toLowerCase()+ (n.type==='application'?n.number.slice(0,4)+String(Number(n.number.slice(4))):n.number)+(n.kind?'-'+n.kind.toLowerCase():''):raw;}
export function toMaintenance(raw:string){const n=patentNumber(raw);return n.recognized&&['utility','reissue'].includes(n.type)?n.prefix+n.number.padStart(n.prefix?6:8,'0'):null;}
export class NumberNormalizer{
 unrecognized=0;
 normalize(raw:string){const n=patentNumber(raw);if(!n.recognized)this.unrecognized++;return n.canonical;}
}
