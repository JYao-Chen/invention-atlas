import {ResearchInputError} from './deep-research-store';
export const FULLTEXT_MODEL_TOOLS=new Set(['analyze_tech_matrix','analyze_patent_reading','analyze_claim_elements','compare_claims']);
export function researchToolPolicy(name:string){
 if(FULLTEXT_MODEL_TOOLS.has(name))return {execution:'全文分段模型调用，每个未缓存片段计入预算',selection:'必须显式提供patent_numbers，每批1至5件；compare_claims至少2件；权利要求分析用claim_numbers明确所读条款',reading:'先从统计、检索或原文片段确定案例及研究问题。只需几段文字时直接read_patent；需要系统整理全文或结构化逐项对照时再调用本工具。复用已保存分段，解释范围对应所选案例。'};
 if(name==='analyze_clustering')return {execution:'本地向量聚类，加技术主题命名模型调用',reading:'先看组规模、关键词和代表编号，再按问题阅读代表原文。名称须与实际组内资料对应。'};
 if(['search_patents','search_patent_passages'].includes(name))return {execution:'文本检索与语义查询向量调用',reading:'先按问题检索，取相关片段或元数据定位公开编号。命中Top-K用于选案例，不代替全库计数。'};
 if(name==='read_patent_details')return {execution:'读取已保存资料，不额外调用模型',reading:'指定patent_numbers读取元数据。需要摘要、权利要求或说明书时优先read_patent，带阅读问题按字段分页，避免整篇回传。'};
 return {execution:'本地统计或图计算，不逐篇调用文本模型',reading:'可以对明确的数据全集计算。先看方法、分母和前20行预览，再按研究问题用read_result分页取完整行。'};
}
export function requireResearchSelection(name:string,params:Record<string,unknown>,records?:{id:string}[]){
 if(!FULLTEXT_MODEL_TOOLS.has(name))return;
 const ids=params.patent_numbers;
 if(!Array.isArray(ids)||!ids.length||ids.length>5||ids.some(id=>typeof id!=='string'||!id.trim()))throw new ResearchInputError('该工具会逐篇全文调用模型。请按研究问题显式指定patent_numbers，每批1至5件；只读几段原文用read_patent。全库分布使用统计工具。');
 if(records){const missing=ids.filter(id=>!records.some(p=>p.id===id));if(missing.length)throw new ResearchInputError('指定公开编号不在当前数据集：'+missing.join('、')+'。请从实际结果选择，不推测编号。');}
 if(name==='compare_claims'&&new Set(ids).size<2)throw new ResearchInputError('权利要求对照至少指定两个公开编号，第一个为基准。');
}
