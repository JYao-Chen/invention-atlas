# 使用与线上相同的演示数据

演示版本 `demo-data-v1` 固定了三个数据集、现有文本向量及论文资料。导入后默认选中3000条的区块链专利库，报告库和对话历史各有两份预计算示例。

## 首次运行

需要 Node.js 22.16 或更新的22.x版本，以及已启动的 Docker 和 Docker Compose。

```sh
git clone https://github.com/JYao-Chen/invention-atlas.git
cd invention-atlas
npm ci
npm run setup
npm run demo:import
npm run dev
```

另开一个终端，在同一目录启动后台任务：

```sh
npm run worker
```

打开 <http://127.0.0.1:3017>。登录账号和随机生成的密码保存在本机 `.env.local` 的 `PATENT_USERNAME`、`PATENT_PASSWORD` 中。

`setup` 为本项目创建独立的 PostgreSQL 16 / pgvector 0.8.2 容器，监听本机55418端口；数据库使用 Docker 命名卷持久保存。脚本生成运行角色与队列角色，执行迁移并创建管理员。再次执行会保留已有配置、账号及数据。网页连接使用普通运行角色。

`demo:import` 从 [GitHub Release](https://github.com/JYao-Chen/invention-atlas/releases/tag/demo-data-v1) 下载并导入固定版本。完整的一部分导入成功后会记录版本；再次运行跳过这一部分，保留用户编辑。下载文件缓存于 `data/demo/demo-data-v1/`。导入过程不调用模型。

浏览数据、打开示例报告和运行统计工具均可直接体验。使用分析助手时，在“模型与设置”填写自己的模型接口；语义查询和新增记录的向量生成使用 `.env.local` 中的 `DASHSCOPE_API_KEY`。数据包已有的3400条向量可直接参与检索和聚类，无需重新建立。助手报告随所选模型生成，统计图表使用同一份固定数据。

## 包含的数据

| 内容 | 数量与范围 |
| --- | --- |
| 区块链专利库 | 3000条，2018—2025年 |
| 专利样本库 | 300条，2013—2024年中的10个公开年份 |
| 公开语料采集 | 100条，2023年 |
| 公开编号去重 | 3287件 |
| 标题摘要向量 | 3400条，`text-embedding-v4`，1024维 |
| 公开页面补充字段 | 35条记录中的书目、同族与法律事件信息，附获取日期 |
| 专利—论文关联 | 3494条，涉及822件专利 |
| OpenAlex论文元数据 | 2417篇 |
| 预计算示例 | 公开趋势、年度关键词分析，共两份 |

向量输入为 `标题 + 换行 + 摘要`。专利记录包含完整原文、权利要求及定位信息；全文分段检索索引由用户在系统内另行建立。

## 下载与导入选项

默认导入两个独立文件：`core.jsonl.gz` 包含专利、向量和示例，`papers.jsonl.gz` 包含论文关联和论文元数据。`manifest.json` 记录数量、数据版本和来源。各附件的实际大小见 Release 下载列表。

只导入核心专利数据：

```sh
npm run demo:import -- --core-only
```

以后运行不带参数的导入命令即可补上论文资料，已完成的核心导入会跳过。

也可手动下载附件后从本地目录导入：

```sh
npm run demo:import -- --directory /path/to/demo-data-v1
```

用户有多个项目时，用 `--project 项目编号` 指定自己拥有的目标项目。演示数据集使用固定编号，首次导入应选择尚未安装该演示版本的数据库；它们在目标项目中保存为普通数据集，可编辑和运行分析。

已有数据库的用户可保留 `.env.local`，补充 `MAINTENANCE_DATABASE_URL` 后运行 `setup`。维护连接需要具备迁移与角色管理权限；脚本使用 `atlas_runtime` 与 `atlas_queue` 两个角色，运行连接分别写在 `DATABASE_URL` 与 `QUEUE_DATABASE_URL`。已有角色的密码保持原样。自建数据库流程见[开发说明](DEVELOPMENT.md)。

本地演示数据库的日常启动和停止：

```sh
docker compose --env-file .env.local -f compose.demo.yml up -d --wait
docker compose --env-file .env.local -f compose.demo.yml stop
```

网页和 worker 仍分别通过 `npm run dev`、`npm run worker` 启动。Docker停止后，已有数据保留在命名卷中。

## 数据来源与许可

代码许可见仓库根目录 [LICENSE](../LICENSE)。数据分别保留来源许可。

- **DLT-Patents**：[ExponentialScience/DLT-Patents](https://huggingface.co/datasets/ExponentialScience/DLT-Patents)。发布方将来源USPTO的专利文本说明为公共领域。引用：Hernandez et al., *DLT-Corpus: A Large-Scale Text Collection for the Distributed Ledger Technology Domain*, [arXiv:2602.22045](https://arxiv.org/abs/2602.22045)。固定数据包保留选取后的同一批公开编号及原文字段。
- **公开页面补充字段**：[Google Patents](https://patents.google.com/)。附在专利记录中的书目、同族及法律事件事实保留来源链接和获取日期；个别记录的公开交易背景也保留原始披露链接。数据包包含这些结构化字段。
- **专利—论文关联**：Matt Marx / Aaron Fuegi，*Reliance on Science*，[Zenodo记录22967630](https://zenodo.org/records/22967630)，版本v66，**CC BY-NC 4.0，非商业使用并署名**。引用：[Marx & Fuegi, Hybrid Extraction](https://doi.org/10.1111/jems.12455)；[Marx & Fuegi, Worldwide Front-Page Patent Citations](https://doi.org/10.1002/smj.3145)。该许可适用于 `papers.jsonl.gz` 中的关联数据。
- **论文元数据**：[OpenAlex](https://openalex.org/)，CC0。标题、DOI及发表信息等元数据与上述关联数据一并提供。

## 维护固定版本

维护者可从授权读取的来源数据库重新制作演示附件：

```sh
DEMO_EXPORT_DATABASE_URL=postgresql://... npm run demo:export -- artifacts/demo/demo-data-v1
```

导出器使用固定的数据集编号与公开字段列表，读取专利及外部资料；两份示例由真实统计工具重新计算。输出包含两个gzip文件和manifest。线上用户账号、模型配置及对话历史不进入数据包。

已发布版本保持固定。今后更新选取的记录或向量时，发布新的演示版本，并同步导入器的版本与下载地址。原始来源获取命令 `npm run data:fetch` 和 `npm run data:index` 继续用于自行采集300条基础样本及生成向量。
