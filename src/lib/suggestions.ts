export const questions:Record<string,string>={
 search_patents:'检索当前数据集中与数字身份认证相关的专利，列出代表专利和相关依据。',
 read_patent_details:'选择当前数据集中的一项专利，展示摘要、申请人、权利要求和原文来源。',
 get_dataset_summary:'检查当前数据集的时间范围、字段覆盖率和缺失项，说明哪些分析可以开展。',
 analyze_patent_trend:'统计这批专利的年度公开趋势，展示图表，并说明抽样和缺失年份的影响。',
 analyze_lifecycle:'对这批专利进行生命周期统计，展示观测值、拟合曲线和拟合限制。',
 analyze_ipc_distribution:'分析这批专利的IPC分类分布，找出主要技术分类并展示图表。',
 analyze_country_distribution:'统计这批专利的公开局分布，注意不要将公开局解释为申请人国籍。',
 generate_wordcloud:'统计这批专利的主要技术关键词，展示词频和代表专利。',
 analyze_burst_terms:'识别这批专利的关键词突现区间，说明计算方法和样本限制。',
 analyze_yearly_keywords:'比较这批专利各年份的主要关键词，说明技术关注点的变化。',
 analyze_clustering:'对这批专利进行K-means技术主题聚类，展示聚类散点图、主题关键词和代表专利。',
 analyze_co_network:'分析这批专利的申请人合作关系，展示合作网络和主要合作方。',
 analyze_competitor_evolution:'比较主要申请人的技术分类布局随年份的变化，展示竞争者演化。',
 analyze_entity_portfolio:'比较主要申请人的专利组合，列出数量、技术分类和代表专利。',
 analyze_concentration:'计算这批专利的申请人集中度，解释CR3、CR5和HHI的含义。',
 analyze_tech_roadmap:'根据真实引证关系提取技术主路径，展示路径图及对应专利，不把引证解释为因果。',
 analyze_patent_valuation:'按引证指标筛选值得进一步复核的专利，展示指标依据，不输出商业估值。',
 analyze_tech_matrix:'从专利原文提取技术与效果，生成技术效果矩阵并保留原文证据。',
 analyze_citation_network:'展示这批专利的引证网络，分析共引和文献耦合，区分内部与外部引用。',
 analyze_family_geography:'分析已有真实同族信息的地域分布，说明同族范围与缺失覆盖。',
 audit_search_strategy:'比较blockchain与blockchain identity authentication两种检索策略，展示重合与独有命中。',
 monitor_patent_changes:'为blockchain检索建立数据变化监测基线；已有基线时报告新增和移除记录。',
 analyze_legal_status:'统计已有来源时点法律状态，标明未知记录、获取日期和第三方状态限制。',
 analyze_claim_elements:'选取一项代表专利，拆解权利要求的技术要素与依赖关系，逐项给出原文定位。',
};
export function suggest(tools:{name:string;title:string;group:string;available:boolean}[],previous:string[]=[],random=Math.random){
 const candidates=tools.filter(t=>t.available&&questions[t.name]);
 const shuffle=<T,>(items:T[])=>{const values=items.slice();for(let i=values.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[values[i],values[j]]=[values[j],values[i]];}return values;};
 const fresh=candidates.filter(t=>!previous.includes(t.name)),pool=shuffle(fresh.length>=4?fresh:candidates),chosen:typeof pool=[];
 for(const t of pool)if(!chosen.some(p=>p.group===t.group)&&chosen.length<4)chosen.push(t);
 for(const t of pool)if(!chosen.includes(t)&&chosen.length<4)chosen.push(t);
 return chosen.map(t=>({...t,question:questions[t.name]}));
}
