import type {Dataset,Params,Patent} from './types';

export type ProfessionalWorkflow='technology-landscape'|'competitor-analysis'|'novelty-search'|'patent-layout';
export type ProfessionalPreset={datasetId:string;query?:string;ipc?:string;yearStart?:number;yearEnd?:number;counting?:'publication'|'family';entities?:string;proposal?:string;jurisdictions?:string;objective?:string};
export type ProfessionalLaunch={id:number;workflow:ProfessionalWorkflow;preset:ProfessionalPreset;question?:string};
export type GuideModule='workspace'|'materials'|'disclosures'|'credentials'|'review'|'research';
export const professionalExamples:Record<string,{workflow:ProfessionalWorkflow;question:string}>={
 'landscape-workflow':{workflow:'technology-landscape',question:'研究当前数据集近期公开文献的技术分类、主要主题和申请人布局，结合代表文献生成技术全景报告。'},
 'competitor-workflow':{workflow:'competitor-analysis',question:'选取当前数据集中的两个申请人，比较公开趋势、技术分类组合及共同申请关系，生成竞争主体报告。'},
 'novelty-workflow':{workflow:'novelty-search',question:'以分布式账本数字身份认证方案为演示输入，提取技术特征，确认检索策略和候选专利，再逐特征比较原文。'},
 'layout-workflow':{workflow:'patent-layout',question:'研究数字身份认证中的技术措施与效果关系，结合原文矩阵提出并选择可进一步验证的研发方向。'},
};
export const guideModules:Record<string,GuideModule>={'deep-research':'research',workspace:'workspace',materials:'materials',disclosures:'disclosures',integrations:'credentials',review:'review'};
export function professionalPreset(workflow:ProfessionalWorkflow,dataset:Dataset,records:Patent[]):ProfessionalPreset{
 const years=dataset.years.map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
 const entities=[...new Set(records.flatMap(record=>record.applicants).filter(Boolean))].slice(0,2);
 const ipc=records.find(record=>record.ipc.length)?.ipc[0]?.slice(0,4);
 return {datasetId:dataset.id,counting:'publication',yearStart:workflow==='competitor-analysis'?years[0]:years.at(-2)??years[0],yearEnd:years.at(-1),query:'',
  ...(workflow==='competitor-analysis'?{entities:entities.join('\n')}:{ipc}),
  ...(workflow==='novelty-search'?{proposal:'演示方案：客户端生成公私钥对，将身份标识与公钥的关联记录写入分布式账本。认证时，服务端发送随机挑战值，客户端使用私钥签名，服务端根据账本中的公钥验证签名；身份撤销后记录撤销状态，后续认证拒绝已撤销的身份。',jurisdictions:'US'}:{}),
  ...(workflow==='patent-layout'?{query:'digital identity authentication',objective:'研究分布式账本身份认证中的密钥验证、身份撤销与隐私保护措施，整理原文声明的效果；在不泄露用户身份信息的约束下提出待验证方向。'}:{})};
}
export function toolExampleParams(tool:string,defaults:Params,records:Patent[]):Params{
 const params:Params={...defaults};
 if(['search_patents','search_patent_passages'].includes(tool))params.query='blockchain digital identity authentication';
 if(['read_patent_details','analyze_patent_reading','analyze_claim_elements','analyze_tech_matrix','compare_claims'].includes(tool)&&!params.patent_numbers?.length){params.patent_numbers=records.slice(0,tool==='compare_claims'?2:1).map(record=>record.id);}
 return params;
}
