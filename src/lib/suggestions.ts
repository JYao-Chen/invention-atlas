export const questions:Record<string,string>={'compare_keyword_methods': '换几种方法看看，这批专利的核心关键词一致吗？',
 'analyze_patent_reading': '帮我看懂一项专利：它解决什么问题，具体怎样实现？',
 'search_patent_passages': '找找数字身份认证在专利原文中是怎样实现的。',
 'compare_claims': '这两项专利的技术方案有什么相同和不同？',
 'audit_dataset': '帮我检查一下这批专利数据的质量。',
 'search_patents': '帮我找数字身份认证相关的专利。',
 'read_patent_details': '帮我看看一项专利的具体内容。',
 'get_dataset_summary': '这批专利主要包含哪些内容？',
 'analyze_patent_trend': '这批专利这些年有什么变化？',
 'analyze_lifecycle': '这个技术领域处于怎样的发展阶段？',
 'analyze_ipc_distribution': '这些专利主要涉及哪些技术方向？',
 'analyze_country_distribution': '这些专利主要在哪些公开局发布？',
 'generate_wordcloud': '这批专利经常讨论哪些技术？',
 'analyze_burst_terms': '哪些技术话题是在某些年份突然受到关注的？',
 'analyze_yearly_keywords': '大家关注的技术问题，这些年发生了什么变化？',
 'analyze_clustering': '这些专利可以归纳成哪些技术主题？',
 'analyze_co_network': '哪些申请人经常一起申请专利？',
 'analyze_competitor_evolution': '主要参与者的技术布局这些年有什么变化？',
 'analyze_entity_portfolio': '主要申请人各自侧重哪些技术方向？',
 'analyze_concentration': '这些专利主要集中在哪些申请人手里？',
 'analyze_tech_roadmap': '沿着引证关系，能看到怎样的技术发展路径？',
 'analyze_patent_valuation': '哪些专利值得优先阅读，为什么？',
 'analyze_tech_matrix': '选一个案例，看看技术措施怎样对应它要解决的问题。',
 'analyze_citation_network': '这些专利之间有哪些引用和知识联系？',
 'analyze_family_geography': '这些专利的同族主要覆盖哪些地区？',
 'audit_search_strategy': '只搜区块链和进一步搜身份认证，结果有什么区别？',
 'monitor_patent_changes': '帮我持续关注区块链相关专利的变化。',
 'analyze_legal_status': '这些专利资料记录的法律状态是什么？',
 'analyze_claim_elements': '帮我读懂一项专利的权利要求保护了哪些技术特征。'};
export function suggest(tools:{name:string;title:string;group:string;available:boolean}[],previous:string[]=[],random=Math.random){
 const candidates=tools.filter(t=>t.available&&questions[t.name]);
 const shuffle=<T,>(items:T[])=>{const values=items.slice();for(let i=values.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[values[i],values[j]]=[values[j],values[i]];}return values;};
 const fresh=candidates.filter(t=>!previous.includes(t.name)),pool=shuffle(fresh.length>=4?fresh:candidates),chosen:typeof pool=[];
 for(const t of pool)if(!chosen.some(p=>p.group===t.group)&&chosen.length<4)chosen.push(t);
 for(const t of pool)if(!chosen.includes(t)&&chosen.length<4)chosen.push(t);
 return chosen.map(t=>({...t,question:questions[t.name]}));
}
