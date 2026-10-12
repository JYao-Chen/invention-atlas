import {mkdirSync,writeFileSync} from 'node:fs';
import {guideChapters} from '../src/lib/help-guide';
mkdirSync('docs',{recursive:true});
const markdown=`# Invention Atlas 使用说明\n\n本说明书按专利挖掘流程编排，说明各功能的研究用途、实现方法、操作及结果解释。应用中的“使用说明”提供章节跳转、功能入口和助手咨询。截图保留真实运行的页面及对应范围，不表示所有功能都在截图中完整展示。章节链接指向公网应用，本地部署可使用相同的#guide/章节标识。\n\n${guideChapters.map(c=>`- [${c.number} ${c.title}](#${c.id})`).join('\n')}\n\n${guideChapters.map(c=>`<a id="${c.id}"></a>\n\n# ${c.number} ${c.title}\n\n${c.intro}\n\n[打开应用中的本章](https://patent.jyaochen.cn/#guide/${c.id})（需要登录）\n\n${c.sections.map(s=>`## ${s.title}\n\n${s.body}\n${s.figure?`\n![${s.caption}](../public/help/desktop-${s.figure}.png)\n\n<details><summary>手机截图</summary>\n\n![${s.caption}](../public/help/mobile-${s.figure}.png)\n\n</details>\n`:''}`).join('\n')}\n${c.question?`\n### 示例请求\n\n> ${c.question}\n`:''}`).join('\n---\n\n')}\n`;
writeFileSync('docs/USER-GUIDE.md',markdown.trimEnd()+'\n');
console.log('Generated docs/USER-GUIDE.md');
