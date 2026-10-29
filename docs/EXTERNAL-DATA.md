# 外部参考数据层

本模块只下载、筛选、规范化、保存来源与查询覆盖率；不计算质量、寿命、CD 指数或其他分析指标，也不修改 `patents` 与现有 payload。

## 来源与可达性（2026-10-29）

| 数据 | 地址与版本 | 探查结果 |
| --- | --- | --- |
| D1 / D2 / D1′ | [PatentsView ODP 迁移指南](https://data.uspto.gov/support/transition-guide/patentsview)，产品目录 `https://api.uspto.gov/api/v1/datasets/products/PVGPATDIS` | 无 key GET 返回 401；文件端点 `https://api.uspto.gov/api/v1/datasets/products/files/PVGPATDIS/g_patent.tsv.zip` 同样返回 401。实际文件清单、大小、更新时间尚不能确认，需认证后读取 `fileDownloadURI`。 |
| D3 | `https://api.uspto.gov/api/v1/datasets/products/ptmnfee2` | 无 key GET 返回 401；因此未确认最新周文件的实际 URI、大小和更新时间。 |
| D4 | [Zenodo 最新版本 API](https://zenodo.org/api/records/5080077/versions/latest)，当前指向 [22967630](https://zenodo.org/records/22967630) | `pcs_oa_uspto.csv`，1,437,584,291 字节，更新时间 `2026-09-25T20:27:11.160540+00:00`，CC BY-NC 4.0。无 key 元数据 GET 返回 200，文件 Range GET 返回 206。 |
| D5 | [OpenAlex Works](https://api.openalex.org/works) | 无 key 的 `filter=openalex_id:W2741809807&per-page=1` 请求返回 200。元数据为 CC0；无 key 使用共享 IP 的免费预算，可能很快耗尽。 |

D4 当前文件直链：`https://zenodo.org/api/records/22967630/files/pcs_oa_uspto.csv/content`。探查只读取文件开头 4096 字节，没有下载整个原始文件。实际表头是 `reftype,confscore,oaid,patent,wherefound`，没有自引列，因此保存 `self_citation=NULL`，不能将其解释成“非自引”。未来文件若增加 `self_citation` 或 `selfcite` 列，解析器保留该标记。`oaid` 补 `W` 前缀；`app` / `exm` 等原始标记不改写。

`patentsview.org` 已迁移到 ODP；旧 `https://s3.amazonaws.com/data.patentsview.org/download/g_us_patent_citation.tsv.zip` 返回 403，不作为回退来源。USPTO 的 [bulk API 说明](https://data.uspto.gov/apis/bulk-data/search) 明确要求 API key。请由用户按 [ODP Getting Started](https://data.uspto.gov/apis/getting-started) 登录自己的 USPTO.gov 账号，按页面要求完成验证并获取 ODP API key，以环境变量 **`USPTO_ODP_API_KEY`** 提供；请求放入 `X-API-KEY` 头。程序不注册账号、不读取 `.env`、不寻找其他 key。

PatentsView/USPTO 的本次认证后许可证条款尚待核对，manifest 暂记 `USPTO public data (source terms apply)`，不据此承诺商业再分发授权。D4 **限非商业使用**，应保留作者 Matt Marx / Aaron Fuegi、数据版本及 DOI 的署名和来源，商业使用需另行获得许可。D5 元数据的 CC0 不改变 D4 关联表的非商业限制。

## 表结构与权限

迁移 `043_external_reference_data.sql` 创建：

- `external_sources`：来源、版本、URL、许可证、获取时间、子集摘要、SHA-256、数据行数、字节数与状态。
- `ext_patents`：去类型码的 US 参考编号、专利类型、申请日、授权日、CPC、受让人及其国别、权利要求数。
- `ext_patent_citations`：引用方、被引方、原始引用类别、`purpose=D1|D2` 和来源。
- `ext_maintenance_events`：编号、事件日、事件码、实体类型、来源。
- `ext_patent_paper_links`：编号、OpenAlex work ID、原始置信度、引用人标记、自引标记、`where_found`、来源。
- `ext_papers`：work ID、DOI、标题、年份、刊物/会议、类型、被引数、主主题与完整 topics JSON、获取时间、来源。
- `external_source_seeds`：已完整扫描的种子及用途。它区分“扫描完成但零匹配”和“尚未获取”。

与任务建议的差别：增加 `purpose`、`where_found` 和扫描种子表；`ext_papers` 也带来源；事实表主键包含 `source_id`，保留跨版本事实，读取方需要按来源选择版本。置信度保持原始 1–10 量纲，不转换成概率。没有虚构自引标记；日期以 `YYYY-MM-DD` 文本从读取服务返回，避免 PostgreSQL date 的本地时区偏移。

所有表属于全局参考数据，没有组织列。启用 RLS，仅提供 SELECT 策略，没有运行角色写入策略。迁移若发现现有 `atlas_runtime` 角色，只授予 SELECT 并撤销写入及 TRUNCATE 权限；其他部署角色应由维护者同样只授予 SELECT。维护连接需拥有这些表或具有 BYPASSRLS。不要授予运行角色表所有权、BYPASSRLS、TRUNCATE 或 DDL 权限。测试额外给普通角色授予 DML 权限后，仍验证 RLS 拒绝插入、更新和删除。

## 编号与子集

`src/server/external/patent-number.ts` 使用 `US` + 类型前缀 + 无前导零数字作为参考键，去除 B1/B2 等类型码。申请公开件保留四位年及七位流水号；Reliance on Science 的未补零流水号会补齐，例如 `us-2015133390-a1` → `US20150133390`。授权件与申请公开件不自动建立对应关系。支持设计 D、再颁 RE、植物 PP、法定发明 H、保护性公开 T；无法识别的输入原样保留并计数。维持费格式只对实用/再颁专利适用。

- D1：以语料授权件为被引方，流式筛选 `g_us_patent_citation`，收集所有引用方。
- D2：以这些引用方筛选其全部美国授权件、美国申请公开件及外国专利后向编号，分别读取 `g_us_patent_citation`、`g_us_application_citation`、`g_foreign_citation`；外国编号保留国别及原始编号并计入 US 规范化未识别数。用途仅标为 D2，供后续 CD 分析。
- D1′：语料授权件及 D1 引用方，从 `g_patent`、`g_application`、`g_cpc_current`、`g_assignee_disambiguated`、`g_location_disambiguated` 补著录。
- D3：语料授权件和 D1 引用方全部维持费事件；必须先完成 D1，采用产品目录中最新累计周快照；累计属性见 [美国政府数据目录](https://catalog.data.gov/dataset/patent-maintenance-fee-events-1981-present)。
- D4：语料全部编号匹配，不设置信度阈值，保留来源全部标记。
- D5：所选种子关联的去重 work ID，每请求不超过 50 个，`filter=openalex_id:W...|W...`，逐批保存。

PatentsView 字段结构依据其 [Granted Data Dictionary 存档](https://zenodo.org/records/15783125)；**当前 ODP 认证响应的包装结构、实际文件名及 ptmnfee2 格式还没有真实文件验证**。解析器遇到缺列、坏日期、无效数值或目录结构变化会停止并在 manifest 标记 blocked，不用空值掩盖这些错误。

## 构建命令

要求 Node.js（项目版本）及项目锁文件安装的依赖。新增锁定版本 `unzipper@0.12.3` 和开发类型声明 `@types/unzipper@0.10.11`：维持费 ZIP 包可能同时包含事件表及代码说明表，必须流式选择 `MaintFeeEvents_<日期>.txt`；PatentsView 选择单个 TSV 成员。CSV/TSV 支持流式 UTF-8、引号、跨块转义和字段内换行，gzip 使用 Node zlib。

```sh
npm ci
npx tsx scripts/external/build-all.ts --dry-run
npx tsx scripts/external/build-patentsview.ts --dry-run
npx tsx scripts/external/build-maintenance.ts --dry-run
npx tsx scripts/external/build-science.ts --dry-run
npx tsx scripts/external/build-openalex.ts --dry-run
```

本 worktree 的构建器只允许连接 **atlas_test**，维护连接优先 `QUEUE_DATABASE_URL`，其次 `PG_TEST_DATABASE_URL`，均未设置时用 `postgresql://atlas_dev@127.0.0.1:55417/atlas_test`。不使用应用的 `DATABASE_URL`，不连接正式库或开发库。默认创建临时 `external_test_<uuid>` schema，运行结束后自动删除；`--schema external_test_<名称>` 可在测试库保留 schema 供审阅和续跑。迁移全在该 schema 内执行。

本 worktree 不含完整专利记录，也没有从主检出或其他数据库读取。审核方已提供只读编号文件 `/home/yao/artifacts/invention-atlas/external-seeds/corpus-numbers.json`：3287 个去重公开编号，其中实用授权件 1467、再颁件 1、申请公开件 1819；前 50 个均为实用授权件。构建器接受此文件绝对路径，不修改它。其他环境由维护者提供 JSON 字符串数组 `corpus-numbers.json`（只含原始公开编号）。例如：

```json
["US10095888B1", "US20210273804A1"]
```

提供真实编号及 key 后先以子集验收：

```sh
PG_TEST_DATABASE_URL=postgresql://atlas_dev@127.0.0.1:55417/atlas_test \
  npx tsx scripts/external/build-all.ts --limit 50 \
  --seeds data/corpus-numbers.json --schema external_test_review \
  --output data/external/review-50
```

`--limit` 限制排序去重后的前 N 个语料种子，不限制其引用/事件/科学链接行数；即使只有 50 个种子，也可能需要扫描完整上游流。默认输出为 gitignore 的 `data/external/<source>/<version>/`；`--output` 修改这个根目录，必须位于当前 worktree 内。每个来源有独立可运行的 `build-<source>.ts`，参数相同。单独运行 D3/D5 时，使用保留了 D1/D4 的同一 `--schema`。

`OPENALEX_API_KEY` 和 `OPENALEX_MAILTO` 可选，程序仅从进程环境读取；没有 key 时使用无 key 请求，每秒最多 1 个请求。遇到 HTTP 401/402/403/429 立即停止当前来源；成功响应若提示额度为 0，则保存本批后停止。不会自动重试消耗已耗尽的额度。

## 清单、磁盘限制和续跑

`manifest.json` 保存来源、版本、许可证、种子、筛选规则、起止时间、行数、输出字节、状态/阻塞原因、未识别编号次数、OpenAlex 请求次数以及每个 JSONL 文件的 SHA-256。`external_sources.sha256` 是按阶段顺序将文件 SHA-256 以换行连接后再次求 SHA-256 的子集摘要；原始文件没有落盘，也不将该摘要冒充上游完整原始文件的校验和。OpenAlex 的缺失 work 列在 `missingWorks` 中。

所有原始文件采用下载 → 流式解压 → 流式筛选，不保留原始文件，原始临时文件为 **0 字节**。筛选阶段写 `.part`，成功后重命名；失败立即删除 `.part`。输出根目录的已有占用、新增 JSONL 和清单合计达到 3,000,000,000 字节前停止，不截断为“成功”。因此原始临时文件不会触及 4 GB 上限。该上限指子集文件，数据库行及索引占用另计。不要并发运行同一输出目录。

续跑执行相同命令、同一输出根与相同种子。已完成阶段验证 SHA-256，并在事务中重放 JSONL，幂等 upsert；中断的阶段重新扫描其原始流。D4 中途失败后需重新扫描 CSV，未实现字节级断点。OpenAlex 以每 50 个 work 为断点，已保存批次不再请求；未收到的整批仍待请求。D3 目标或 D5 work 列表变化时拒绝混用缓存，需要另选输出根；语料种子变化也一样。来源返回新版本会写新版本目录。ODP 文件的发布日、最后修改日和数据覆盖起止日（目录提供时）分别保留在 discovery 中，目录更新时间不冒充数据截止时间。OpenAlex 使用稳定 `api-v1` 目录以跨日期续跑，每篇论文保留获取时间。

清单为 blocked 的来源不标记扫描完成。汇总命令允许其他独立来源继续，最后有 blocked 时退出 **2**；参数/初始化失败退出 **1**；全部完成或成功 dry-run 退出 **0**。`probe.json` 是 dry-run 报告，`summary.json` 是实际运行各表行数、文件字节、总耗时与 OpenAlex 请求数；这两份及测试日志被 gitignore。

## 读取服务与接口

`ExternalReferenceReader` 提供只读 `sources`、`patents`、`citations`、`maintenance`、`paperLinks`、`papers`、`coverage` 方法；引用、事件和科学链接每页最多 1000 行，使用 offset 续取。全局参考表可以按编号读取；`coverage(datasetId)` 先通过当前访问上下文查询数据集，受数据集 RLS 约束，再计算去重的有记录件数和已扫描件数。

`GET /api/datasets/{id}/external-coverage` 复用现有登录/项目校验，允许 reader；未登录 401，不可读数据集 404，非 GET 为 405（项目 reader 的写请求由现有项目层先返回 403）。项目只读 Bearer 凭据也可使用该 datasets 子路由。返回 `covered`、`completedScans`、`sources` 及缺口说明；部分导入的来源也返回来源状态。OpenAPI 已增加该接口。

## 已知覆盖缺口与容量

- 申请公开件、设计及植物专利没有维持费义务；无事件不等于失效。维持费代码保持原始事件，不推断到期/复效结论。
- D1 只观察所下载授权表覆盖截止时间内的引用；没有未来引用、未授权引用方或全世界专利的完整引用。D2 的美国申请引用历史起点及外国编号质量受源数据限制。
- CPC 来自 `g_cpc_current`，属于当前回溯分类，并非全部授权当日分类。
- D4 最新版本说明覆盖 through 2025；2026 年记录可能没有科学链接。缺少自引列、低置信度匹配、文内/首页覆盖都要在后续分析处理。
- OpenAlex 批量请求没有返回的 work 记录为缺失，不能补造标题、主题或被引数。缓存重放不会自动刷新论文计数；刷新应使用新的输出根。
- 在认证目录尚不可用时，**不能给出可信的所有来源全量子集大小及总时长**；D4/D5 的实测和粗略情景估算见下。3 GB 是停止上限，不是已证明的容量估计。D4 单次扫描传输 1.438 GB，若持续带宽分别为 10/50 MB/s，仅网络下限约 144/29 秒，另加解析和入库；D1 需对美国授权引用表扫描两遍，其他表各一遍；D5 请求数为 `ceil(去重 work 数/50)`，顺序请求至少同等秒数。应以真实 50 种子结果及 ODP 文件大小重新估算，不外推合成夹具的耗时。

50 种子合成演练可在不访问外部数据和不提供 key 的情况下运行，数据只来自仓库内小夹具：

```sh
npx tsx scripts/external/build-all.ts --limit 50 \
  --fixture-dir tests/fixtures/external \
  --seeds tests/fixtures/external/seeds.json --output data/external-fixture-50
```

真实语料的 50 种子子集已经运行，结果见下；全量（无 `--limit`）本次未运行，留给审核通过后执行。当前 ODP 产品元数据解析、文件匹配、维持费实际格式与大 ZIP/ZIP64 解压仍需拿到 key 后做真实子集验证；夹具通过不替代这些验证。


## 2026-10-29 审核续跑结果

实际运行的真实种子命令（退出 2，因为 ODP 来源 blocked）：

```sh
npx tsx scripts/external/build-all.ts --limit 50 --seeds /home/yao/artifacts/invention-atlas/external-seeds/corpus-numbers.json
```

只扫描 D4 原始 CSV **一次**，无需修正编号格式或重扫。D4 完成用时 123554 ms；D5 完成用时 4860 ms；包含目录探查与临时 schema 初始化的总耗时 134783 ms。没有提供 ODP/OpenAlex key 或 mailto，OpenAlex 使用匿名请求。75 条链接覆盖 14/50 件授权件，包含 57 个去重 work；2 次请求取得 56 篇，`W4206688049` 未在批量响应返回，记录于 `missingWorks`。链接键无重复，也没有同键属性冲突。

| 表 | 行数（删除临时 schema 前） |
| --- | ---: |
| external_sources | 4 |
| ext_patents | 0 |
| ext_patent_citations | 0 |
| ext_maintenance_events | 0 |
| ext_patent_paper_links | 75 |
| ext_papers | 56 |
| external_source_seeds | 100（D4、D5 各 50） |

D1/D2/D1′ 与 D3 因缺少 `USPTO_ODP_API_KEY` 保持 blocked。D4/D5 complete；缺失 work 不补造元数据。JSONL 子集共 **124705 字节**：科学链接 17413 字节，论文元数据 107292 字节。运行结束的来源清单及汇总另占 21098 字节；再次执行 dry-run 写入 probe 后，`data/external/` 所有文件合计 **147482 字节**。没有 `.part` / `.tmp` 或完整原始 CSV 文件。临时 schema `external_test_9751d3f4d82643028c64012ebddb22de` 在 finally 中自动删除，子集与清单保留在 `data/external/`，未写入其他数据库。

验收命令与退出码：

| 命令 | 退出码 | 关键结果 |
| --- | ---: | --- |
| `npm ci` | 0 | 按更新后的锁文件安装 292 个包；既有依赖版本未升级。npm 报 7 项漏洞，未做本任务之外的升级。 |
| `npm install --save-exact unzipper@0.12.3` | 0 | 新增流式多成员 ZIP 解析依赖。 |
| `npm install --save-dev --save-exact @types/unzipper@0.10.11` | 0 | 对应 TypeScript 声明。 |
| `npm run typecheck` | 0 | 审核续跑完整通过。 |
| `PG_TEST_DATABASE_URL=postgresql://atlas_dev@127.0.0.1:55417/atlas_test npm test` | 0 | 329 项：324 通过、0 失败、5 跳过，65226 ms。没有更改既有 model-usage 测试或嵌入模型配置。 |
| `npx tsx scripts/external/build-all.ts --dry-run` | 0 | 仅读取目录；ODP key 阻塞和 Zenodo 文件元数据写入 probe。 |
| 上述真实 `--limit 50 --seeds ...` 命令 | 2 | 预期的部分完成：D4/D5 成功，ODP 来源 blocked。 |

审核续跑日志分别为 gitignore 的 `data/external-review-typecheck.log`、`data/external-review-test.log`、`data/external-review-dry-run.log`、`data/external-real-50.log`；机器可读结果为 `data/external/summary.json`。

全量 3287 种子的**情景估算**：样本前 50 件全是授权件，不能代表其余 1819 件申请公开件。若其余授权件保持样本每件 1.5 条科学链接的均值，申请公开件分别按“零匹配”和“同均值”两种情景，D4 约 2202–4931 条链接；D5 在去重前约 1674–3747 个 work，约 34–75 次请求。按本次每行文件体积外推，D4/D5 JSONL 约 **3.7–8.2 MB**；一次 D4 扫描仍约 124 秒，加上入库、串行批量请求，先按 **4–10 分钟**预留。该区间不是置信区间或容量保证；跨专利论文重叠会减少请求，主题/年份差异会改变匹配密度，匿名额度可能使任务提前停止。D1/D2/D1′/D3 尚无认证文件大小及引用方规模，**全量所有来源的总大小和总时长仍无法可靠估计**，拿到 key 后应先真实跑这 50 件再更新估计。3 GB 限制为强制停止上限。

仍需审核者/用户提供 `USPTO_ODP_API_KEY` 并核对认证目录、许可、ptmnfee2 实际格式与大 ZIP 行为；获取入口是上文 ODP Getting Started。无需再提供真实种子。全量运行留待审核通过后执行。
