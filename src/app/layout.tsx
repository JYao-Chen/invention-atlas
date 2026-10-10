import type {Metadata} from 'next';
import 'katex/dist/katex.min.css';
import './globals.css';
import './tally-ui.css';
import './journal-colors.css';
export const metadata:Metadata={title:'Invention Atlas · Patent analysis with traceable evidence',description:'专利检索、原文阅读与分析报告'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><head><link rel="stylesheet" href="/fonts/wenkai.css"/></head><body><script id="design-contract" type="application/json" dangerouslySetInnerHTML={{__html:JSON.stringify({thesis:'用户选定查询工作台：查询控件与结果同页，助手按需展开',world:'复用TallyBear暖白纸面、褐灰正文、青绿操作、柔和次按钮、圆角面板；左侧可折叠导航、手机底部导航，无小熊形象',story:'确认数据范围、填写查询与过滤条件、执行工具、回查原文、保存报告',viewport:'64px顶部导航，74px上下文栏；全宽记录或工具目录加查询范围；助手默认隐藏',form:'查询工作台 / candidate 5 / 60513243 / user-pinned text direction, code-led execution',finish:'unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance'})}}/>{children}</body></html>;}
