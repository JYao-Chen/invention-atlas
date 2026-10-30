import {mkdirSync,writeFileSync} from 'node:fs';
import {guideChapters,projectRepository} from '../src/lib/help-guide';
mkdirSync('docs',{recursive:true});
const example=(chapter:typeof guideChapters[number])=>chapter.example||chapter.question?`\n## 试一个例子\n\n> ${chapter.example?.question||chapter.question}\n\n在应用中点击“填入示例”，${chapter.example?'进入专业任务创建表单':'打开工具参数表单'}。可以修改参数后运行，也可直接运行示例，或将问题填入助手后发送。专业任务先确认表单再开始。\n`:'';
const community=`\n---\n\n欢迎使用与共建：[GitHub 仓库](${projectRepository}) · [反馈问题](${projectRepository}/issues) · [提交改进](${projectRepository}/pulls)\n`;
const markdown=`# Invention Atlas 使用说明\n\n本说明按专利研究流程编排。每章先介绍功能和用途，再说明操作与结果阅读。应用中可以搜索章节、打开对应功能，或填入示例后开始分析。\n\n登录自己部署的应用，在首页地址后追加章节路由即可打开相应说明，例如 \`#guide/start\`。\n\n${guideChapters.map(c=>`- [${c.number} ${c.title}](#${c.id})`).join('\n')}\n\n${guideChapters.map(c=>`<a id="${c.id}"></a>\n\n# ${c.title}\n\n${c.intro}\n\n${c.purpose}\n\n应用中的章节路由：\`#guide/${c.id}\`。\n${example(c)}\n${c.sections.map(s=>`## ${s.title}\n\n${s.body}\n${s.figure?`\n<details><summary>查看界面示例</summary>\n\n![${s.caption}](../public/help/desktop-${s.figure}.png)\n\n手机截图：\n\n![${s.caption}](../public/help/mobile-${s.figure}.png)\n\n</details>\n`:''}`).join('\n')}${community}`).join('\n\n')}\n`;
writeFileSync('docs/USER-GUIDE.md',markdown.trimEnd()+'\n');
console.log('Generated docs/USER-GUIDE.md');
