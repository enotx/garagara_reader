# Plan.md

每一步都能独立验证。标 [N] 的步骤在 Node 里完成，不需要 UI；标 [W] 的在浏览器里；标 [iOS] 的需要 Xcode。
没有开发者账号时，真机测试用免费的 Personal Team 签名（7 天有效）。

## M0 工程骨架
| 步骤 | 内容 | 验证 |
|---|---|---|
| 0.1 [N] | pnpm workspace、TS strict、Vitest、ESLint/Prettier，创建各个空包 | `pnpm test` 能跑通一个空测试 |
| 0.2 [W] | apps/reader 的 Vite + React 骨架；Playwright WebKit 冒烟测试 | 页面能打开，e2e 测试通过 |
| 0.3 [N] | 准备 fixtures：3 本 Standard Ebooks、2 本 Gutenberg epub、1 本结构混乱的 epub、2 个 txt | 文件和来源说明已入库 |

## M1 导入与规范化（packages/core）
| 步骤 | 内容 | 验证 |
|---|---|---|
| 1.1 [N] | 解压 epub，解析 container.xml、OPF 的 manifest/spine/metadata | 快照：元数据和 spine 列表 |
| 1.2 [N] | 目录：EPUB3 读 nav.xhtml，EPUB2 读 toc.ncx | 快照：目录树 |
| 1.3 [N] | XHTML DOM 按白名单映射成 Block + Mark（Spec §6.1） | 快照：每章的 Block JSON；文字不丢失（对比原文纯文本长度） |
| 1.4 [N] | 脚注：语义标注识别 + 启发式识别；脚注正文从正文流中移出 | 快照：noteRef mark 和 Note 列表 |
| 1.5 [N] | 图片：提取文件，记录宽高 | image 块都带 width/height |
| 1.6 [N] | txt 导入：按空行分段、正则识别章节、识别不出时切虚拟章节 | 快照 |
| 1.7 [N] | 计算书的内容哈希 | 同一个文件导入两次，哈希相同 |

## M2 英语语言包（packages/lang-en + tools/dict-build）
| 步骤 | 内容 | 验证 |
|---|---|---|
| 2.1 [N] | 分句：Intl.Segmenter 加缩写规则（Mr. / e.g. / 引号内句末） | 用例表：每个边界情况至少一条 |
| 2.2 [N] | 分词：Intl.Segmenter（word），输出带偏移的 Token | 偏移可以还原出原文 |
| 2.3 [N] | Python 脚本：ECDICT 转内置词典 SQLite（词条、简明释义、词频、词形变化、多词条目） | 抽查词条；检查数据库体积 |
| 2.4 [N] | 词形还原：用 ECDICT 词形变化字段建反查表，查不到再走规则 | took→take、children→child、better→good |
| 2.5 [N] | 短语匹配：先还原词形，再匹配多词条目，允许中间插入不超过 3 个词 | took…into account、give it up 能命中 |
| 2.6 [N] | 意群切分（规则版）：按标点、连词、从句引导词切分，限制最短和最长长度 | 用例表 |

## M3 存储（packages/storage）
| 步骤 | 内容 | 验证 |
|---|---|---|
| 3.1 [N] | schema v1 和 migration 机制（Spec §4.3）；适配器接口，实现 Node 版 | migration 测试 |
| 3.2 [N] | 导入管线写库：books/chapters/blocks/notes/images/sentences/chunks | 导入 fixture 后统计行数 |
| 3.3 [N] | Locator 和偏移、句子之间的互相转换 | 往返转换测试 |
| 3.4 [W] | 适配 wa-sqlite，浏览器里可以导入和读取 | 手动导入一本书 |

## M4 渲染与分页（apps/reader）
| 步骤 | 内容 | 验证 |
|---|---|---|
| 4.1 [W] | 把一章的 Block 渲染出来；样式区间和句子区间交叉时切段渲染；片段带上 data-block/data-start | 目测样式；e2e 检查 DOM 文本和块文本一致 |
| 4.2 [W] | CSS 多栏分页、左右滑动翻页、显示章节和百分比 | 手动测试 |
| 4.3 [W] | 排版稳定性：图片按宽高占位、字体加载完成后才分页；改字号后保持 Locator | e2e：改字号后，页首的文字仍在当前页 |
| 4.4 [W] | PageMap：句子和焦点片段所在的页、跨页切分点（Spec §10.3） | e2e：抽查跨页句子 |
| 4.5 [W] | 主题：浅色、深色、护眼、e-ink（Spec §12） | 目测；e-ink 主题下没有任何 transition |

## M5 交互骨架
| 步骤 | 内容 | 验证 |
|---|---|---|
| 5.1 [N] | 手势路由 + 状态机，先实现"普通阅读"和"有卡片"两列 | 单元测试按手势表逐格覆盖 |
| 5.2 [W] | 命中检测：caretRangeFromPoint 换算成块偏移，再找到 Token；点在词间空隙时吸附到最近的词 | e2e：点击坐标得到正确的词 |
| 5.3 [W] | 页眉页脚呼出菜单（顶栏、底栏） | 手动测试 |
| 5.4 [W] | 词卡（只用词典）：放置规则、短语展开、"只看 X"、上滑展开全屏 | 手动测试和 e2e |
| 5.5 [W] | 脚注弹窗 | 手动测试 |

## M6 LLM（packages/llm）
| 步骤 | 内容 | 验证 |
|---|---|---|
| 6.1 [N] | OpenAI-compatible Provider：超时、重试、取消；设置页填写 baseURL、model、key | 用 mock server 测试 |
| 6.2 [N] | 缓存表和缓存 key（Spec §9.3） | 缓存命中测试；提示词版本变化后缓存失效 |
| 6.3 [W] | 词卡里的"本句含义"：联网优先 / 词典优先两种策略，先显示词典结果占位 | 断网和联网分别手动测试 |
| 6.4 [W] | 长按整句翻译浮层 | 手动测试 |

## M7 Focus 模式
| 步骤 | 内容 | 验证 |
|---|---|---|
| 7.1 [W] | 用 Highlight API 做三层显示（变暗、当前句、当前意群），推进单位可设置 | 目测；分页前后 DOM 和页数不变 |
| 7.2 [N+W] | 手势表的 Focus 列；页脚换成控制条（高度不变） | 状态机测试；e2e 检查正文区尺寸不变 |
| 7.3 [W] | 跨页推进：先推进到本页片段，再翻页 | e2e |
| 7.4 [W] | 字幕浮层，放置规则；预取后面 3 句的译文 | 手动测试 |

## M8 生词本
| 步骤 | 内容 | 验证 |
|---|---|---|
| 8.1 [N+W] | 词卡上的 ☆ 写入生词，带原句快照和 Locator | 单元测试和手动测试 |
| 8.2 [W] | 生词列表页：跳回原文、标记已知词 | 手动测试 |

## M9 iOS 打包（MVP 完成）
| 步骤 | 内容 | 验证 |
|---|---|---|
| 9.1 [iOS] | Capacitor iOS 工程、SQLite 插件、Keychain 存储、文件导入（文档选择器和分享） | 模拟器跑通全流程 |
| 9.2 [iOS] | 真机测试（Personal Team 签名） | 完成 MVP 验收清单 |

MVP 验收清单：导入 epub 和 txt → 分页阅读 → 点词（词典和本句含义）→ 短语展开 → 长按整句翻译 → Focus 推进（含跨页）→ 加入生词 → 改字号后进度不变 → 断网后词典和缓存仍然可用。

## v0.2 播放与预处理
- PlaybackEngine 接口和 Web 实现（Web Speech API），作为行为基准（Spec §13）
- iOS 原生插件：AVSpeechSynthesizer、后台音频、锁屏信息和控制；直接读 sentences 表
- 播放模式交互：自动进入 Focus、按字符边界自动翻页、点词时暂停、"回到当前句"
- 批量预处理：整句翻译 + 短语 + 难词释义合并成一次请求；预处理策略设置；网络状态检测

## v0.3
- 导出 Anki .apkg
- 导入 mdx 词典，作为"详细释义"标签页
- 云端 TTS

## 后期
后端（订阅、默认 API、同步）→ 桌面版（Tauri）→ Android（Kotlin 播放插件、e-ink 真机测试和翻页键）→ 滚动排版 → 更多语言包、可切换解释语言 → CEFR 评估 → 端侧 TTS（sherpa-onnx）→ 同源词对照 → Galgame 模式