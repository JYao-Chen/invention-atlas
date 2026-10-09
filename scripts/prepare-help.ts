import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {guideChapters} from '../src/lib/help-guide';
mkdirSync('docs',{recursive:true});
writeFileSync('docs/USER-GUIDE.md',`# Invention Atlas 使用说明\n\n应用内从“使用说明”进入。目录可搜索，功能按钮打开页面，演示问题需主动发送；截图可切换电脑与手机并查看大图。以下应用链接指向默认本地入口，其他部署可将地址替换为自己的域名。\n\n${guideChapters.map(c=>`- [${c.title}](#${c.id})`).join('\n')}\n\n${guideChapters.map(c=>`<a id="${c.id}"></a>\n\n# ${c.title}\n\n${c.intro}\n\n[打开应用中的本章](http://127.0.0.1:3017/#guide/${c.id})（需要登录）\n\n${c.body}\n${c.figure?`\n![${c.caption}](../public/help/desktop-${c.figure}.png)\n\n<details><summary>手机截图</summary>\n\n![${c.caption}](../public/help/mobile-${c.figure}.png)\n\n</details>\n`:''}`).join('\n---\n\n')}\n`);
writeFileSync('docs/USER-GUIDE.md',readFileSync('docs/USER-GUIDE.md','utf8').trimEnd()+'\n');
console.log('Generated docs/USER-GUIDE.md');
