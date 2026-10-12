import type {Patent} from './types';
export type PatentEvidenceLocation={section:string;quote:string;start:number;claim?:number};
export function resolvePatentEvidence(patent:Patent,location:PatentEvidenceLocation){
 const text=location.section==='claim'?patent.claims.find(claim=>claim.number===location.claim)?.text:location.section==='abstract'?patent.abstract:location.section==='description'?patent.description:undefined;
 if(typeof text!=='string'||!Number.isInteger(location.start)||location.start<0||!location.quote||text.slice(location.start,location.start+location.quote.length)!==location.quote)return undefined;
 return {text,start:location.start,end:location.start+location.quote.length};
}
