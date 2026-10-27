# AGENTS.md

## 项目简介
一个帮助外语学习者阅读外语原著的阅读器，本地优先、可离线使用。
核心体验：点词查义（词典 + LLM 本句含义）、整句翻译（LLM）、Focus 模式（逐句/逐意群高亮）。
MVP 范围：iOS 平台，学习语言为英语，解释语言为中文，用户自带 OpenAI-compatible API，没有后端。

开始任何工作前先读：
- SPEC.md：规格，出现冲突时以它为准
- PLAN.md：步骤顺序和每步的验收标准

## 工作方式
1. 严格按 PLAN.md 的步骤推进，一次只做一个步骤。做完后运行验证，汇报结果，等确认后再进入下一步。
2. 每一步的改动要小到可以单独审阅和回滚。不要一次生成跨多个包的大量代码。
3. SPEC.md 有缺失、矛盾，或者实现上走不通时，停下来提问，不要自己发明规则。
4. 改动以下任何一项，都必须在同一次改动里更新 SPEC.md：数据模型、SQLite schema、插件接口、手势表、LLM 输出格式。schema 的变更还要附带 migration。
5. 先写测试或测试用例，再写实现。纯逻辑（core、状态机、分页映射）都必须有单元测试。

## 技术栈（已确定，不要替换）
| 层 | 选型 |
|---|---|
| 语言 | TypeScript（strict 模式）；词典构建脚本用 Python |
| UI | React + Vite |
| 核心逻辑 | 纯 TS 包，不依赖 DOM、React 或 Capacitor |
| 存储 | SQLite：iOS 用 Capacitor SQLite 插件，浏览器开发用 wa-sqlite，测试用 Node 的 SQLite |
| 移动端壳 | Capacitor（先做 iOS，后做 Android） |
| 桌面端壳（后期） | Tauri 2 |
| 后端（后期） | Python + FastAPI |
| 包管理 / 测试 | pnpm workspace / Vitest / Playwright（WebKit 引擎） |
| 最低系统版本 | iOS 17.2（依赖 CSS Custom Highlight API） |

## 仓库结构
```
apps/reader/            Vite + React 阅读器 UI
packages/core/          导入、规范化、分句、定位、PageMap 计算等纯逻辑
packages/lang-en/       英语语言包（分句、分词、词形还原、意群、短语匹配）
packages/storage/       schema、migrations、存储适配器接口和 Repository
packages/llm/           LLM Provider、提示词（带版本号）、缓存
packages/playback/      PlaybackEngine 接口和 Web 实现；Capacitor 插件（ios/ 和 android/）（v0.2）
tools/dict-build/       Python 脚本：把 ECDICT 转成内置词典 SQLite
fixtures/               测试用 epub/txt（只放公版书）和快照
```

## 常用命令（约定，M0 阶段落实）
- `pnpm i` 安装依赖
- `pnpm dev` 启动浏览器开发服务器
- `pnpm test` 运行所有单元测试
- `pnpm test:e2e` 运行 Playwright WebKit 测试
- `pnpm typecheck`、`pnpm lint`
- `pnpm cap:ios` 构建并同步到 iOS 工程

## 编码规范
- 字符偏移一律使用 UTF-16 code unit，也就是 JS 字符串索引。Swift 的 NSRange 也是 UTF-16，两端一致。
- 书内实体（章节、块、句子、意群）用确定性 ID；用户数据用 UUIDv7。规则见 Spec §4。
- 时间统一用毫秒级 Unix 时间戳（整数）。
- core 和 lang-* 包里不允许出现 I/O。存储、网络、时间都通过参数或接口注入。
- 禁止使用 `any`。对外导出的函数要写 JSDoc，并说明偏移是闭区间还是开区间。
- 语言相关逻辑只能写在语言包里，core 只依赖 `LanguagePack` 接口。

## 硬性约束（违反视为 bug）
- 阅读进度绝不存页码，只存 Locator。
- 排版只在排版参数变化时重算（Spec §10）。Focus、播放、字幕、词卡、菜单都不能改变正文区尺寸，也不能改变排版。
- 不在客户端使用 Next.js 或任何 SSR 框架。
- 不内置非开放授权的词典或词表。mdx 只能由用户导入。
- API key 只存放在系统安全存储（iOS Keychain）里，不写进 SQLite、不写进日志、不提交到仓库。
- 日志里不打印书籍全文。

## 完成定义（每一步都要满足）
- `pnpm typecheck && pnpm lint && pnpm test` 全部通过
- 新增的逻辑有测试覆盖；涉及 UI 的改动附上手动验证步骤
- 涉及 Spec 的改动已经同步更新
- 汇报包括：做了什么、怎么验证的、哪些没有验证、遗留问题