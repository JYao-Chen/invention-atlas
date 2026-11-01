import {ArrowDown,ArrowRight,CornerUpLeft} from 'lucide-react';
import type {ReactNode} from 'react';

function Node({name,children}:{name:string;children:ReactNode}){return <div className="architecture-node"><strong>{name}</strong><span>{children}</span></div>;}
const Next=()=> <ArrowRight className="architecture-next" size={18} aria-hidden="true"/>;
export default function AgentArchitectureFlow(){
 return <figure className="help-architecture-flow architecture-detail" aria-label="智能体研究流程图">
  <section aria-labelledby="architecture-chat-title"><header><h4 id="architecture-chat-title">对话分析 · 职责节点交接</h4><p>共享问题、计划、范围、工具结果与报告状态</p></header>
   <div className="architecture-sequence"><Node name="Planner">研究范围 · 工具步骤与参数</Node><Next/><Node name="Search">命中编号 · 每次查询来源</Node><Next/><Node name="ResearchReview">候选相关性 · 剔除与补检索</Node></div>
   <p className="architecture-return"><CornerUpLeft size={15} aria-hidden="true"/>需要扩大候选范围：ResearchReview → Search，最多补检索两轮</p>
   <ArrowDown className="help-flow-down" size={20} aria-hidden="true"/>
   <div className="architecture-sequence"><Node name="Analysis">趋势 · 主题 · 主体等综合分析</Node><Next/><div className="architecture-branches"><strong>按计划并行进入三条分支</strong><span>Claim · 权利要求要素</span><span>Comparison · 条款比较</span><span>Citation · 引证网络</span></div><Next/><Node name="ExecutionAudit">等待分支汇合 · 检查执行结果</Node></div>
   <ArrowDown className="help-flow-down" size={20} aria-hidden="true"/>
   <div className="architecture-sequence"><Node name="Report">综合结果 · 组织正文与图表</Node><Next/><Node name="Audit">核对公开编号与数值</Node><Next/><Node name="完成回答">保存回答、结果与研究范围</Node></div>
   <p className="architecture-return"><CornerUpLeft size={15} aria-hidden="true"/>需要校正：Audit → ReviseReport → Report，完成一次自动修订</p>
  </section>
  <section aria-labelledby="architecture-deep-title"><header><h4 id="architecture-deep-title">深度报告 · 持续研究循环</h4><p>同一个研究 Agent 接续状态，按新结果决定下一步</p></header>
   <div className="architecture-sequence"><Node name="理解目标与已有状态">research_state</Node><Next/><Node name="保存研究方案">propose_outline</Node><Next/><Node name="确认提纲">confirm_outline · 接收用户调整</Node></div>
   <p className="architecture-return"><CornerUpLeft size={15} aria-hidden="true"/>修改要求 → 读取反馈 → 更新方案 → 再次确认；全自动模式直接进入研究</p>
   <ArrowDown className="help-flow-down" size={20} aria-hidden="true"/>
   <div className="architecture-research-loop"><div className="architecture-loop-heading"><strong>研究 Agent</strong><span>读取当前发现，选择分析、阅读、写作或修订</span></div><div className="architecture-loop-actions"><Node name="分析与结果">run_analysis → read_result</Node><Node name="原文与证据">read_patent / read_patent_papers / read_evidence</Node><Node name="章节与发现">read_chapter → write_chapter</Node></div><p>每次工具返回结果后继续判断；章节发现与证据供后续步骤复用</p></div>
   <div className="architecture-skill-connection"><strong>Skills 指导方法</strong><span>规划、全景分析、原文研读、证据写作、事实修订、中文整理，通过只读技能目录加载。</span></div>
   <ArrowDown className="help-flow-down" size={20} aria-hidden="true"/>
   <div className="help-flow-output"><strong>finish_report → 报告库</strong><span>组装章节，保留来源、图表和版本</span></div>
  </section>
  <figcaption>上图的每个节点、工具与技能，在下面的表中分别列出输入、作用与交付内容。</figcaption>
 </figure>;
}
