import type {Metadata} from 'next';
import 'katex/dist/katex.min.css';
import './globals.css';
export const metadata:Metadata={title:'Invention Atlas · Patent analysis with traceable evidence',description:'专利检索、原文阅读与分析报告'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}</body></html>;}
