import {mkdirSync,writeFileSync} from 'node:fs';
import {guideChapters} from '../src/lib/help-guide';
mkdirSync('docs',{recursive:true});
const example=(chapter:typeof guideChapters[number])=>chapter.example?`\n### 使用实例\n\n> ${chapter.example.question}\n\n在应用中点击“填入示例并打开功能”，进入对应专业任务的创建表单。数据集及参数自动填入，可修改后点击“创建并准备首阶段”；跳转不提交任务。\n`:chapter.question?`\n### 示例请求\n\n> ${chapter.question}\n\n${chapter.tool?'在应用中点击“直接运行示例”，在查询工作台按演示参数运行该工具，结果显示在本页；点击“填入示例并打开功能”则只打开参数表单，确认后点击“运行分析”。':'在应用中点击“直接运行示例”，把该问题发给分析助手；点击“填入示例并打开功能”只把问题放入输入框，不发送。'}如需功能解释，可单独点击“询问助手”。\n`:'';
const markdown=`# Invention Atlas 使用说明\n\n本说明书按专利挖掘流程编排，说明各功能的研究用途、实现方法、操作及结果解释。应用中的“使用说明”提供章节跳转、功能入口和助手咨询。截图保留真实运行的页面及对应范围，不表示所有功能都在截图中完整展示。目录链接用于跳转本文章节。登录自行部署的应用后，可在“使用说明”中选择对应章节，或在应用首页地址后追加本章给出的路由片段；例如追加 \`#guide/start\` 打开系统概述。\n\n${guideChapters.map(c=>`- [${c.number} ${c.title}](#${c.id})`).join('\n')}\n\n${guideChapters.map(c=>`<a id="${c.id}"></a>\n\n# ${c.number} ${c.title}\n\n${c.intro}\n\n自部署应用中的章节路由：\`#guide/${c.id}\`（登录后使用）。\n\n${c.sections.map(s=>`## ${s.title}\n\n${s.body}\n${s.figure?`\n![${s.caption}](../public/help/desktop-${s.figure}.png)\n\n<details><summary>手机截图</summary>\n\n![${s.caption}](../public/help/mobile-${s.figure}.png)\n\n</details>\n`:''}`).join('\n')}\n${example(c)}`).join('\n---\n\n')}\n`;
writeFileSync('docs/USER-GUIDE.md',markdown.trimEnd()+'\n');
console.log('Generated docs/USER-GUIDE.md');
