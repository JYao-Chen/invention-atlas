export const TOOL_DEFS=[
 ['analyze_patent_reading','技术问题、手段与效果','检索与读取',['abstract']],
 ['search_patent_passages','全文片段检索','检索与读取',[]],
 ['search_patents','专利检索','检索与读取',['title','abstract']],['read_patent_details','专利详情','检索与读取',['title']],
 ['get_dataset_summary','数据概况','数据与态势',[]],['analyze_patent_trend','公开趋势','数据与态势',['publicationDate']],['analyze_lifecycle','生命周期统计','数据与态势',['publicationDate']],['analyze_ipc_distribution','IPC分类分布','数据与态势',['ipc']],['analyze_country_distribution','记录公开局','数据与态势',[]],
 ['generate_wordcloud','关键词词频','热点与主题',['title']],['analyze_burst_terms','关键词突现','热点与主题',['publicationDate','abstract']],['analyze_yearly_keywords','年度关键词','热点与主题',['publicationDate','title']],['analyze_clustering','技术主题聚类','热点与主题',['embedding']],
 ['analyze_co_network','申请人合作网络','竞争格局',['applicants']],['analyze_competitor_evolution','竞争者演化','竞争格局',['applicants','publicationDate','ipc']],['analyze_entity_portfolio','申请人组合','竞争格局',['applicants']],['analyze_concentration','申请人集中度','竞争格局',['applicants']],
 ['analyze_tech_roadmap','引证技术主路径','技术路线',['publicationDate','citations']],['analyze_patent_valuation','引证指标筛查（非估值）','价值与机会',['publicationDate']],['analyze_tech_matrix','技术效果矩阵','价值与机会',['abstract']],
 ['analyze_citation_network','引证、共引与耦合','引证与同族',['citations']],['analyze_family_geography','同族地域','引证与同族',['familyMembers']],
 ['audit_search_strategy','检索策略审计','审计与监测',['title']],['monitor_patent_changes','数据变化监测','审计与监测',['title']],
 ['analyze_legal_status','来源时点法律状态','法律与权利要求',['legalStatus','legalAsOf']],['analyze_claim_elements','权利要求要素','法律与权利要求',['claims']],
 ['compare_claims','权利要求对照','法律与权利要求',['claims']],['audit_dataset','数据质量审计','审计与监测',[]],
 ['compare_keyword_methods','关键词方法对比','热点与主题',['title','abstract']],
] as const;
