import type {Params} from '@/lib/types';

type Plan={scope:{mode:'dataset'|'search'|'previous';counting:'publication'|'family'};steps:{tool:string;params:Params}[]};
const statistics=new Set(['get_dataset_summary','audit_dataset','analyze_patent_trend','analyze_lifecycle','analyze_ipc_distribution','analyze_country_distribution','generate_wordcloud','analyze_burst_terms','analyze_yearly_keywords','analyze_concentration','analyze_entity_portfolio','analyze_competitor_evolution','analyze_co_network']);

export function classificationStatistics(question:string,plan:Plan):Plan{
 const codes=[...new Set(question.toUpperCase().match(/\b[A-HY]\d{2}[A-Z]\b/g)||[])];
 const steps=plan.steps.filter(s=>s.tool!=='search_patents');
 if(codes.length!==1||!steps.length||!steps.every(s=>statistics.has(s.tool))||/相似|查找|代表专利|检索.{0,12}专利|分析方法.{0,8}专利/.test(question))return plan;
 const years=[...question.matchAll(/\b((?:19|20)\d{2})\b/g)].map(m=>Number(m[1]));
 const explicitYears:Params=years.length>=2?{year_start:Math.min(...years),year_end:Math.max(...years)}:years.length===1?{year_start:years[0],year_end:years[0]}:{};
 return {scope:{...plan.scope,mode:'dataset'},steps:steps.map(s=>{
  // A classification statistic uses the complete filtered corpus, not a search Top-K.
  const {query: _query,year_start: _start,year_end: _end,...params}=s.params;
  return {...s,params:{...params,ipc:codes[0],...explicitYears}};
 })};
}

export const researchReviewInstruction='你是专利检索复核员。必须区分研究对象和分析方法：用户要求对通信协议专利做关键词突现、聚类或年度统计时，研究对象仍是通信协议，不能转而寻找采用突现检测、专利挖掘或文献计量方法的专利，也不能因候选未使用这些分析方法而剔除。只在用户明确寻找分析方法本身的专利时检索这些方法。根据问题、检索策略、候选标题摘要评估是否需要补检索。只输出JSON {"decision":"sufficient/expand/limited","reason":"具体依据","query":"补检索的英文词，仅expand需要","excluded":[{"patent":"候选编号","reason":"明显偏离研究对象的具体理由"}]}。只剔除明确不相关的候选，不凭标题猜测未知全文。不确定相关性时保留并说明限制。候选跨领域、遗漏关键概念或零结果时可以换研究对象的检索表达；不凭少量样本声称查全。两轮以内，不能用扩大Top-K伪装提高质量。';

export function keepReviewOnSubject<T extends {decision:'sufficient'|'expand'|'limited';reason:string;query?:string;excluded:{patent:string;reason:string}[]}>(question:string,review:T):T{
 if(review.decision==='expand'&&/burst detection|keyword extraction|patent mining|text mining|bibliometric/i.test(review.query||'')&&!/方法.{0,12}专利|专利.{0,12}方法|算法.{0,12}专利/.test(question))return {...review,decision:'limited',reason:'补检索偏离研究对象，转向了分析方法；未采用该检索表达和剔除建议。',query:undefined,excluded:[]};
 return review;
}
