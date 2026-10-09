// Shared categorical palette keeps theme legends and points consistent.
export const chartColors=['#4F75B0','#EF6E65','#73C5B7','#AC99CD','#EB965E','#82B6DF','#D8B288','#5C9E95','#E3B7BC','#C49C4A','#657DA0','#959595'];
export const graphColors={internal:'#4F75B0',external:'#EB965E',applicant:'#5C9E95',selected:'#936BAC',edge:'#c3cbd5'};
export const toolGroups:Record<string,string>=Object.fromEntries([
 ['检索与读取',['search_patents','read_patent_details']],
 ['数据与态势',['get_dataset_summary','analyze_patent_trend','analyze_lifecycle','analyze_ipc_distribution','analyze_country_distribution']],
 ['热点与主题',['generate_wordcloud','analyze_burst_terms','analyze_yearly_keywords','analyze_clustering']],
 ['竞争格局',['analyze_co_network','analyze_competitor_evolution','analyze_entity_portfolio','analyze_concentration']],
 ['技术路线',['analyze_tech_roadmap']],['价值与机会',['analyze_patent_valuation','analyze_tech_matrix']],
 ['引证与同族',['analyze_citation_network','analyze_family_geography']],
 ['审计与监测',['audit_search_strategy','monitor_patent_changes','audit_dataset']],
 ['法律与权利要求',['analyze_legal_status','analyze_claim_elements','compare_claims']],
].flatMap(([group,tools])=>(tools as string[]).map(tool=>[tool,group as string])));
