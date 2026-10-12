# 材料 OCR：MinerU Cloud

本系统迁移了 WeKnora v0.8.2 集成工作树中修改过的 MinerU Cloud 调用流程：申请上传批次、上传 PDF、轮询解析状态、下载结果包。使用 `vlm` 模型，启用 OCR、表格和公式识别。

平台管理员可在“管理 → OCR 配置”设置 MinerU 服务地址、模型、识别语言和 API Key。已有环境密钥显示为已配置，留空保存会将现有密钥加密保存到共享数据目录的 `mineru-config.json`；页面不回传密钥。网页保存配置优先于环境配置，Web 和后台 worker 每次调用读取，无需重启。服务器需要配置 `PATENT_MODEL_CREDENTIAL_KEY` 作为凭据加密密钥，与组织模型使用同一配置。也可通过 `PATENT_MINERU_API_KEY` 配置，新建材料 OCR 任务使用 MinerU Cloud；未配置时保留本地 Tesseract。任务保存所选引擎，运行失败不会切换引擎。密钥只由服务器读取，不进入浏览器、任务记录或报告。可选参数见 `.env.example`。

PDF 使用 Poppler 的 `pdfseparate`、`pdfunite` 提取并合并所选原始页，不转成图片。每片最多 100 页、10 MiB；超过大小限制的分片继续二分。单页仍超过限制时提示压缩原材料。结果包通过 `unzip` 读取逐页 `content_list`，将分片页码映射回用户选择的原始 PDF 页码，保留文本、表格及公式。不会把整份 Markdown 当成某一页；缺少逐页结果时明确失败。

PostgreSQL 的 `material_ocr_parts` 保存已申请的批次、上传状态和完整分片结果；`material_ocr_pages` 保存可供查新任务选择的逐页内容。超时、取消或重启后复用已上传批次和已完成分片。服务端明确返回解析失败时清除该批次，重试重新提交。所有记录遵循原任务的组织、项目访问权限。

安装依赖：Poppler（`pdfseparate`、`pdfunite`）及 `unzip`；如果还需要执行历史 Tesseract 任务，继续保留 Tesseract 中英文语言包。执行数据库迁移后再启动 Web 与 worker。

本地已用 WeKnora 当前配置的真实 MinerU Cloud `vlm` 识别中英文扫描 PDF，并验证完成结果复用；独立worker保存分片、逐页结果并创建选页查新任务通过。2026-10-12公网同样提交扫描PDF，由生产worker完成MinerU识别，返回原始第1页及中英文文本。凭据仅保存在服务器私有配置中，未写入源码或验证输出。验收材料移除后原始文件按材料保留规则保存。
