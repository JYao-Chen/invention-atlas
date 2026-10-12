# 专利分析平台 MCP

本目录是本地 stdio 接入包的源文件。构建命令为 `node scripts/build-patent-mcp.mjs`，生成独立的 `server.mjs` 和第三方许可文件。复制本目录时必须包含这两个生成文件；仅复制Git中的清单不能启动服务。运行需要Node.js 22，平台Web服务和后台worker仍独立部署。

在平台“管理 → 接口凭据”创建项目凭据。设置 `ATLAS_API_URL` 为平台接口根地址（含 `/api/`），`ATLAS_API_TOKEN` 为密钥。清单中的环境占位符需由客户端配置展开；若客户端不支持占位符，请在其私有环境配置中设置真实值，不要写入共享清单。

stdio启动命令为 `node server.mjs`，不向stdout打印日志。另提供 `http-server.mjs`，按下节配置HTTP接入。没有自动安装或连接用户的Codex/ChatGPT账户。

## HTTP 接入

构建后执行 `node http-server.mjs`。设置 `ATLAS_API_URL` 为固定平台接口地址，`ATLAS_MCP_PORT` 默认为3032。HTTP进程仅监听127.0.0.1，MCP路径为 `/mcp`；请求的Host不能改变后端平台地址。

每个客户端在请求头设置 `Authorization: Bearer <项目凭据>`。HTTP进程不使用全局ATLAS_API_TOKEN代表所有用户；每次请求先向平台验证该凭据，再创建独立的工具实例。只读凭据能读取已有数据、进度和结果，不能运行分析。每次调用重新验证，到期、撤销或成员变化后不能继续访问。

SDK使用Streamable HTTP。需要对外部署时，将已经授权的HTTPS反向代理转发到本机端口，并把 `ATLAS_MCP_PUBLIC_HOSTNAME` 设为实际外部主机名（不含协议和端口）。默认仅接受localhost类Host／浏览器Origin。当前源码没有配置公网入口，也未实现OAuth登录流程；只能在支持显式Bearer配置的客户端中使用，不宣称所有宿主直接可连。

## 调用流程

1. 使用 `atlas_list_datasets` 获取当前项目数据集编号。
2. 使用 `atlas_tool_capabilities` 检查该数据集的字段、工具可用性和参数。
3. 直接调用检索或统计工具；每次明确传入 `datasetId` 和 `params`。直接分析需要读写凭据。`semantic:false` 仅关闭检索向量，不关闭其他模型抽取。
4. 根据返回的 `contract`、`scope`、`warnings` 和 `rowSources` 解释结果。完整结果可用 `atlas_read_result` 分页读取；继续读取 `nextOffset`，不要把一页当作全部统计。

长任务先使用 `atlas_create_conversation` 创建对话，再用相同数据集调用 `atlas_submit_analysis`。返回运行编号后用 `atlas_read_run` 读取状态和保存产物。需要停止时调用 `atlas_stop_run`。等待超时不能重复提交同一问题，先读取现有运行；浏览器或MCP进程关闭不会自动删除后台任务。

当前共有28项平台分析工具和7项工作流辅助操作。返回 `unavailable` 表示范围、字段或索引不足，不表示统计值为零。没有完整法律状态和同族数据时，不得据此给出确定法律结论。撤销、到期或失去项目权限后，凭据不能继续读取资源。
