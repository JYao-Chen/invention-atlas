# 数据格式、开发与部署

[使用说明](USER-GUIDE.md) · [工具参考](TOOLS.md) · [返回README](../README.md)

## 运行与配置

使用Node.js 22.16及以上、npm。`npm ci`安装锁文件中的版本；复制 `.env.example` 为 `.env.local` 后填写自己的账号和Key。开发用 `npm run dev`，生产用 `npm run build` 和 `npm start`。默认地址为 `127.0.0.1:3017`。

| 环境变量 | 用途 |
| --- | --- |
| `PATENT_USERNAME`、`PATENT_PASSWORD` | 单账号登录；密码必须自行设置 |
| `DASHSCOPE_API_KEY` | 默认模型及百炼嵌入接口凭证 |
| `PATENT_MODEL` | 初始对话模型，默认qwen3.8-flash |
| `PATENT_API_BASE_URL` | 初始OpenAI兼容接口 |
| `PATENT_EMBEDDING_MODEL` | 百炼嵌入模型，默认text-embedding-v4 |
| `PATENT_DATA_DIR` | 数据目录，默认data，可设绝对路径 |
| `PATENT_DATASET_ROWS_URL` | 可选的自管HF rows转发地址，仅页面采集入口使用 |

页面保存的对话模型配置在数据目录的 `model-config.json`，不会回显Key。保存后新请求生效；测试连接不会保存。不要上传这个文件。

## 规范化JSONL

每行一个JSON对象，UTF-8编码。应使用真实来源记录，以下只说明字段，不作为可导入的演示专利。

| 字段 | 类型与含义 |
| --- | --- |
| `id`、`title`、`abstract` | 公开编号、标题、摘要字符串 |
| `applicants`、`assignees`、`inventors` | 字符串数组，身份分别保存 |
| `publicationDate`、`filingDate` | YYYY-MM-DD，未知留空 |
| `ipc`、`cpc` | 分类号数组，不能互相替代 |
| `claims` | `{number, text}`对象数组，可保留原文定位 |
| `description`、`rawText` | 说明书及原始全文字符串 |
| `citations` | 引用公开编号数组 |
| `familyId`、`familyMembers` | 来源同族标识、真实成员公开编号数组 |
| `legalStatus`、`legalAsOf` | 来源状态及获取/判断时点 |
| `sourceUrl`、`sourceName` | 来源链接和名称 |

公开编号规范化为大写字母和数字。文件导入合并重复编号；手动新增拒绝同数据集的重复编号。未知字段不应通过合成文本补齐。其他格式转换见 `src/server/importers.ts`，缺失数据会限制对应能力。

## 持久化与发布

SQLite保存专利、向量、数据集、对话、事件和报告。源窗口及公开页缓存也位于数据目录。代码发布不要覆盖数据目录或私有环境文件。

1. 运行测试和构建；构建失败时不要切换服务。
2. 用SQLite的备份功能保存一致性快照；不要只复制正在写入的主文件而遗漏WAL。
3. 从确认的提交制作独立发布目录，环境与数据通过服务配置指向共享目录。
4. 切换current并重启，保留明确的上一版回滚入口。
5. 检查登录、未登录API保护、数据数量和流式请求。数据迁移或恢复与代码回滚分别处理。

Next.js配置启用standalone。直接运行standalone时，需要将 `.next/static` 复制到 `.next/standalone/.next/static`，将 `public` 复制到 `.next/standalone/public`，再运行 `server.js`。打包排除 `.env*` 和运行数据，避免构建追踪把本地私有文件带上。

反向代理配置HTTPS，SSE关闭响应缓冲并允许长连接。首版没有多租户，部署者应给单账号设置独立密码，并在模型供应商设置费用限制。

## 更新说明与截图

`src/lib/help-guide.ts`是正文主文件，应用直接读取；执行下列命令生成仓库Markdown，避免维护两份不同正文。

```sh
npx tsx scripts/prepare-help.ts
```

截图放在 `public/help/`，应用与README共用，不复制另一套资源。电脑和手机文件名分别为 `desktop-*` 与 `mobile-*`。点击大图使用静态资源链接。

`scripts/capture-help.ts`使用可选的Playwright安装。准备一个有专利及成功关键词分析历史的本地实例，配置 `.env.local` 登录凭证，再运行。没有安装Playwright时可在独立工具环境安装，并用 `PLAYWRIGHT_MODULE` 指向其模块路径；`CHROME_PATH`可指定现有Chromium，`ATLAS_CHECK_URL`可切换验证实例。

```sh
npx tsx scripts/capture-help.ts
npx tsx scripts/prepare-help.ts
npm test
```

采集脚本只登录、读取历史、打开编辑框后取消，不创建任务或修改专利。截图公开前核对是否含私人问题或敏感字段，设置页面的密钥不应出现在截图中。

应用内章节使用 `#guide/<章节id>` 链接，登录后恢复目标章节。章节目录、上一章/下一章与关键词搜索不调用模型。功能按钮只导航；演示按钮只填写问题，用户发送后才运行。

## 验证与贡献

```sh
npm test
npm run typecheck
npm run build
```

测试覆盖算法、范围、数据写入、恢复、事件协议和说明书资源。真实源缓存不存在时相应测试会跳过，模型端到端结果需要另外验证。功能验收和人工专利质量审查不可互相替代。

不要提交 `.env.local`、数据库、模型配置、源页缓存或可用凭证。增加字段或工具时同步类型、接口、表单、说明及最小测试。提交前检查暂存文件，避免把个人QA产物加入仓库。
