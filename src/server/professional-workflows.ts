import {z} from 'zod';
import {materialOriginSchema} from './material-proposal';

const range=z.object({datasetId:z.string().min(1),query:z.string().trim().max(2000).optional(),ipc:z.string().trim().max(100).optional(),yearStart:z.number().int().optional(),yearEnd:z.number().int().optional(),counting:z.enum(['publication','family']).default('publication')});
export const professionalInput=z.discriminatedUnion('workflow',[
 range.extend({workflow:z.literal('technology-landscape')}),
 range.extend({workflow:z.literal('patent-layout'),objective:z.string().trim().min(10).max(5000)}),
 range.extend({workflow:z.literal('competitor-analysis'),entities:z.array(z.string().trim().min(1).max(200)).min(2).max(20)}),
 range.extend({workflow:z.literal('novelty-search'),proposal:z.string().trim().min(20).max(50000),materialOrigin:materialOriginSchema.optional(),proposalOrigin:z.object({type:z.literal('disclosure'),id:z.string().min(1),revision:z.number().int().positive(),title:z.string().min(1)}).optional(),jurisdictions:z.array(z.string().trim().min(1).max(20)).max(20).default([])}),
]).superRefine((input,ctx)=>{
 if(input.yearStart!==undefined&&input.yearEnd!==undefined&&input.yearStart>input.yearEnd)ctx.addIssue({code:z.ZodIssueCode.custom,path:['yearEnd'],message:'结束年份不能早于开始年份'});
 if(input.workflow==='competitor-analysis'&&new Set(input.entities).size!==input.entities.length)ctx.addIssue({code:z.ZodIssueCode.custom,path:['entities'],message:'竞争主体不能重复'});
 if(input.workflow==='novelty-search'&&input.materialOrigin&&input.proposalOrigin)ctx.addIssue({code:z.ZodIssueCode.custom,path:['materialOrigin'],message:'查新输入只能声明一个材料来源'});
});

type Stage={id:string;title:string;tools:string[];outputs:string[];confirmation:boolean};
export type ProfessionalWorkflow={id:string;version:string;title:string;purpose:string;requiredInputs:string[];stages:Stage[];limitations:string[];executionAvailable:boolean};
export const PROFESSIONAL_WORKFLOWS:ProfessionalWorkflow[]=[
 {id:'patent-layout',version:'1.0',title:'专利布局分析',purpose:'围绕用户研发目标，在确认的专利范围中整理技术措施与效果，确认标签后建立证据矩阵及待检索方向。',requiredInputs:['datasetId','objective'],executionAvailable:false,stages:[
  {id:'scope',title:'布局研究范围确认',tools:['get_dataset_summary','audit_dataset'],outputs:['研发目标','年份与分类范围','数据覆盖'],confirmation:true},
  {id:'retrieval',title:'布局候选专利确认',tools:['search_patents'],outputs:['候选集合','检索范围限制'],confirmation:true},
  {id:'extraction',title:'技术措施与效果抽取',tools:['analyze_tech_matrix'],outputs:['原始标签','逐字原文证据','原始矩阵'],confirmation:true},
  {id:'labels',title:'标签保留与合并确认',tools:[],outputs:['用户标签映射','保留与排除证据','确认矩阵'],confirmation:true},
  {id:'directions',title:'候选方向与补检索',tools:['search_patents','search_patent_passages'],outputs:['有证据的候选方向','检索记录','未解决问题'],confirmation:true},
  {id:'report',title:'布局研究报告',tools:[],outputs:['研发目标与范围','证据矩阵','候选方向及限制'],confirmation:false},
 ],limitations:['标签合并是用户确认的研究口径，原始标签与引文仍保留。']},
 {id:'technology-landscape',version:'1.0',title:'技术全景',purpose:'在确认的专题范围内分析公开态势、技术主题和主要主体，并关联代表专利。',requiredInputs:['datasetId'],executionAvailable:false,stages:[
  {id:'scope',title:'研究范围确认',tools:['get_dataset_summary','audit_dataset'],outputs:['计数口径','年份与字段覆盖','研究范围'],confirmation:true},
  {id:'retrieval',title:'专题检索与候选确认',tools:['search_patents','audit_search_strategy'],outputs:['检索策略','候选专利清单'],confirmation:true},
  {id:'analysis',title:'态势与主题分析',tools:['analyze_patent_trend','analyze_ipc_distribution','analyze_yearly_keywords','analyze_clustering','analyze_entity_portfolio'],outputs:['趋势图','主题与主体分布'],confirmation:false},
  {id:'evidence',title:'代表证据整理',tools:['read_patent_details','search_patent_passages'],outputs:['代表专利','原文证据'],confirmation:false},
  {id:'report',title:'全景报告',tools:[],outputs:['证据关联报告'],confirmation:false},
 ],limitations:['结果范围由专题库和检索策略决定，不等同于行业全集。','聚类依赖向量覆盖，缺失时不得用模型补造聚类结果。']},
 {id:'competitor-analysis',version:'1.1',title:'竞争主体分析',purpose:'比较指定主体在同一研究范围内的专利组合、技术分布和演进。',requiredInputs:['datasetId','entities'],executionAvailable:false,stages:[
  {id:'entities',title:'主体名称确认',tools:['analyze_entity_portfolio'],outputs:['名称与别名映射','主体范围'],confirmation:true},
  {id:'scope',title:'比较范围确认',tools:['get_dataset_summary','audit_dataset'],outputs:['年份与计数口径','字段覆盖'],confirmation:true},
  {id:'retrieval',title:'专题候选文献确认',tools:['search_patents'],outputs:['范围内专题候选','检索选择限制'],confirmation:true},
  {id:'analysis',title:'组合与演进比较',tools:['analyze_entity_portfolio','analyze_competitor_evolution','analyze_co_network'],outputs:['主体组合','演进与合作网络'],confirmation:false},
  {id:'evidence',title:'代表专利核对',tools:['read_patent_details'],outputs:['逐主体代表专利'],confirmation:false},
  {id:'report',title:'竞争分析报告',tools:[],outputs:['同口径比较报告'],confirmation:false},
 ],limitations:['专利数量与样本集中度不能直接解释为市场份额。','名称归并须保留来源和用户确认。']},
 {id:'novelty-search',version:'1.0',title:'技术方案查新',purpose:'将技术方案拆分为可核对特征，通过多策略检索建立逐特征对比底稿。',requiredInputs:['datasetId','proposal'],executionAvailable:false,stages:[
  {id:'features',title:'方案要素提取与编辑',tools:[],outputs:['技术问题','必要特征','特征版本'],confirmation:true},
  {id:'strategies',title:'检索策略确认',tools:[],outputs:['术语与同义词','分类约束','多条检索式'],confirmation:true},
  {id:'retrieval',title:'候选文献检索',tools:['search_patents','audit_search_strategy','search_patent_passages'],outputs:['策略命中与重合','原文片段'],confirmation:true},
  {id:'comparison',title:'逐特征证据对比',tools:['read_patent_details','analyze_claim_elements'],outputs:['特征与文献证据矩阵','未找到证据的特征'],confirmation:true},
  {id:'report',title:'查新底稿',tools:[],outputs:['检索记录','证据矩阵','限定范围的评述'],confirmation:false},
 ],limitations:['方案与专利特征比较不同于两份权利要求对照，不能直接用 compare_claims 替代。','未检出不证明新颖性；日期、地域及数据覆盖必须在报告中保留。']},
];

// Execution support describes wired stages, not worker health or model availability.
export const executableStages:Record<string,readonly string[]>={
 'patent-layout':['scope','retrieval','extraction','labels','directions','report'],
 'technology-landscape':['scope','retrieval','analysis','evidence','report'],
 'competitor-analysis':['entities','scope','retrieval','analysis','evidence','report'],
 'novelty-search':['features','strategies','retrieval','comparison','report'],
};
export function workflowCatalog(){return structuredClone(PROFESSIONAL_WORKFLOWS).map(workflow=>({...workflow,executionAvailable:workflow.stages.every(stage=>executableStages[workflow.id]?.includes(stage.id))}));}
