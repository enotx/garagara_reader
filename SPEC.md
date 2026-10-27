# Spec.md

## 1. 术语
| 术语 | 含义 |
|---|---|
| 学习语言（L2） | 书的语言。MVP 为 en |
| 解释语言 | 释义和翻译使用的语言，可以按书设置。MVP 为 zh |
| 块（Block） | 规范化后的内容单元，比如一个段落、一个标题 |
| 意群（Chunk） | 长句按规则切出的片段 |
| 焦点片段（Focus Segment） | 推进单位（句子或意群）和页面范围的交集 |
| Locator | 文本位置：章节序号、块序号、字符偏移 |
| 排版参数 | 字号、字体、行距、页边距、视口尺寸、主题字体 |

## 2. 范围
MVP 要做的：见 Plan.md 的 MVP 验收清单。
CSS、PDF、账号、后端、同步实现、TTS（v0.2）、滚动排版。

## 3. 架构总览
```
UI（React）── 手势路由/状态机 ── 渲染器/分页器/PageMap
   │
core（导入、规范化、定位）── LanguagePack（lang-en）
   │
storage（SQLite schema = Web 层与原生层之间的契约）
   │
llm（Provider/缓存）      playback（v0.2：Web 实现 / Swift / Kotlin）
```
原生代码只有播放引擎一个模块。其他原生能力都用社区插件。

## 4. 数据模型

### 4.1 ID 规则
- 书：`bookId = sha256(原始文件字节)`，取前 32 位十六进制
- 书内实体用确定性 ID，任何设备导入同一本书都会得到相同的 ID：
  - chapterId = `${bookId}:c${chapterIndex}`
  - blockId = `${chapterId}:b${blockIndex}`
  - sentenceId = `${blockId}:s${sentenceIndex}`
- 用户数据（进度、生词、缓存、设置）用 UUIDv7，都带 `updatedAt`，删除时写 `deletedAt`（软删除）
- 每本书记录 `pipelineVersion`。分句或规范化算法变更时，这个版本号要递增，书需要重新导入。重新导入不影响 Locator，因为 Locator 不依赖句子序号。

### 4.2 核心类型
```ts
interface Block {
  id: string; chapterIndex: number; index: number;
  type: 'heading' | 'paragraph' | 'quote' | 'listItem' | 'image' | 'separator' | 'table';
  text: string;            // 纯文本，所有偏移都基于它
  marks: Mark[];
  image?: { assetId: string; width: number; height: number; alt?: string };
}
interface Mark {
  start: number; end: number;   // [start, end)，UTF-16
  type: 'italic' | 'bold' | 'sup' | 'sub' | 'noteRef';
  attrs?: { noteId?: string };
}
interface Sentence { id: string; blockId: string; index: number; start: number; end: number }
interface Chunk { sentenceId: string; index: number; start: number; end: number } // 偏移相对于块
interface Locator { bookId: string; chapterIndex: number; blockIndex: number; offset: number }
```
Token 和短语匹配结果不入库，在加载章节时计算，缓存在内存里。

### 4.3 SQLite 表（v1）
- books(id, title, author, lang, format, pipelineVersion, coverAssetId, importedAt, updatedAt, deletedAt)
- chapters(id, bookId, index, title, tocLevel)
- blocks(id, bookId, chapterIndex, index, type, text, marksJson, imageJson)
- notes(id, bookId, text, marksJson)
- assets(id, bookId, mime, path, width, height)
- sentences(id, bookId, blockId, chapterIndex, index, start, end, text)：原生播放引擎直接读这张表
- chunks(sentenceId, index, start, end)
- progress(id, bookId, locatorJson, updatedAt, deletedAt)
- vocab(id, lemma, surface, lang, sentenceText, locatorJson, meaning, source, status['learning'|'known'], createdAt, updatedAt, deletedAt)
- llm_cache(key, task, resultJson, model, promptVersion, createdAt)
- settings(key, valueJson, updatedAt)

## 5. 定位
- 进度只存 Locator。页码只在运行时由 PageMap 推算出来。
- 显示进度时用"章节标题 + 全书百分比"，百分比按字符数累计计算。

## 6. 导入规范

### 6.1 epub 映射（不解析 CSS，按白名单遍历 DOM）
| 原始元素 | 处理 |
|---|---|
| h1–h6 | heading |
| p、直接包含文本的 div | paragraph |
| blockquote | quote |
| li | listItem |
| img、svg image | image（记录宽高） |
| hr | separator |
| em/i、strong/b、sup/sub | Mark |
| `epub:type="noteref"`、`role="doc-noteref"` | noteRef Mark |
| `epub:type="footnote"`、`role="doc-footnote"`/`"doc-endnote"` | 存为 Note，从正文流中移出 |
| table | table（简单渲染） |
| script、style | 丢弃 |
| 其他元素 | 去掉标签，保留内容 |

兜底规则：任何含有文本、又没被识别的块都当作 paragraph。样式可以丢，文字不能丢。
脚注启发式识别：`<a>` 指向书内的 id，内容是很短的数字或符号，或者包在 `sup` 里，就当作 noteRef。
空白处理：连续空白合并成一个，块首尾的空白去掉。

### 6.2 txt
按空行分段。章节识别的正则包括 `^(Chapter|CHAPTER)\s+\w+`、`^第.+章` 等。识别不出章节时，每大约 5000 字切成一个虚拟章节，切在段落边界上。编码先检测 BOM，没有 BOM 时按 UTF-8 解析，失败再退回 GBK。

## 7. 语言包接口
```ts
interface LanguagePack {
  lang: string;
  splitSentences(text: string): Array<{ start: number; end: number }>;
  tokenize(text: string): Token[];                       // Token: start, end, surface, isWord
  lemmatize(token: Token, ctx: Token[]): string[];       // 候选原形，按可能性排序
  matchPhrases(tokens: Token[], dict: Dictionary): PhraseMatch[]; // 匹配结果可以不连续
  chunk(sentence: string, tokens: Token[]): Array<{ start: number; end: number }>;
}
```
短语匹配规则：基于原形匹配，中间最多插入 3 个词，结果不能跨句。多个匹配重叠时取最长的那个。

## 8. 词典
- 内置词典：从 ECDICT（MIT）构建成 SQLite，包含 headword、简明释义、词性、词频（BNC/COCA）、词形变化，以及多词条目索引
- 用户 mdx 词典（v0.3）：只用于"详细释义"标签页，直接渲染它的 HTML
- 接口：`lookup(lemma, lang, explainLang) → Entry[]`、`hasPhrase(lemmaSeq) → boolean`

## 9. LLM

### 9.1 Provider
OpenAI-compatible 的 chat completions 接口，配置项为 baseURL、model、apiKey（存 Keychain）。默认超时 15 秒，失败重试 1 次，请求可以取消（关闭词卡时取消对应请求）。

### 9.2 任务与输出格式（全部要求输出 JSON）
- `wordInContext`：输入是句子和目标词（用 ⟦ ⟧ 标出），输出 `{ lemma, pos, meaning, phrase?: { text, lemma } }`
- `translateSentence`：输出 `{ translation }`
- `batchPreprocess`（v0.2）：输入多句（带 id），输出 `{ items: [{ id, translation, phrases: [{ text, lemma, meaning }], hardWords: [{ text, lemma, meaning }] }] }`

LLM 返回的偏移不可信。LLM 只返回原文片段，由本地在句子内匹配回偏移，匹配不上就丢弃。

### 9.3 缓存
key = sha256(task, 句子文本, 目标词（如果有）, L2, 解释语言, model, promptVersion)。每个提示词模板都带 promptVersion。

### 9.4 释义来源策略
| 场景 | 联网优先（默认） | 词典优先 |
|---|---|---|
| 点词，在线 | 先显示词典结果占位，LLM 返回后替换为主显示 | 显示词典；没有匹配时自动调用 LLM；保留手动"本句含义"按钮 |
| 点词，离线 | 有缓存显示缓存，否则显示词典 | 显示词典，或提示没有匹配 |
| 整句翻译 | 在线时用 LLM；离线时有缓存显示缓存，否则不可用 | 同左 |

预处理策略（v0.2）：关闭 / 仅 Wi-Fi（默认）/ 总是；范围是当前章往后 N 章（默认 1）。
"可能的生词"的判断：词频排名超过阈值（可以设置），并且不在已知词表里。

## 10. 排版与分页

### 10.1 不变量
- 只有排版参数变化时才重新分页
- Focus、播放、字幕、词卡、菜单不改变正文区尺寸，也不改变 DOM 文本结构
- 页脚区高度固定：普通阅读时显示进度，Focus 和播放时显示控制条
- 图片按宽高比预先占位；字体加载完成后才进行首次分页

### 10.2 实现
CSS 多栏分页加横向平移。页数 = scrollWidth / 页宽。高亮用 CSS Custom Highlight API，不修改 DOM。

### 10.3 PageMap
每次分页后，用 `Range.getClientRects()` 计算：
`pages[i] = { startLocator, endLocator, segments: FocusSegment[] }`，
其中 FocusSegment = 推进单位（句子或意群）与页面范围的交集。跨页的句子会在页面边界处被切开。
Focus 推进、播放翻页、滑动后的焦点定位都查这张表。

## 11. 交互

### 11.1 原则
1. 正文区的点击属于内容，翻页靠滑动
2. 页眉和页脚区在任何模式下都能呼出菜单
3. 先关浮层，再执行动作（点另一个词例外，直接替换卡片内容）
4. 主要按钮放在屏幕下半部分
5. 浮层不遮挡目标：目标在屏幕上半部分时浮层放在下方，反之放在上方

### 11.2 手势表
| 操作 | 普通阅读 | Focus | 播放中（v0.2） | 有卡片打开 |
|---|---|---|---|---|
| 点当前片段所在句的词 | 词卡 | 词卡 | 暂停并打开词卡 | 替换卡片 |
| 点其他句子的词 | 词卡 | 下一片段 | 跳到下一片段 | 替换卡片 |
| 点正文空白 | 呼出/收起菜单 | 下一片段 | 无动作 | 关闭卡片 |
| 点页眉/页脚 | 呼出/收起菜单 | 呼出/收起菜单 | 呼出/收起菜单 | 关闭卡片 |
| 长按句子 | 整句翻译 | 焦点跳到该句 | 播放跳到该句 | 无动作 |
| 左右滑动 | 翻页 | 翻页，焦点移到新页第一个片段 | 只翻页浏览，显示"回到当前句" | 关闭卡片 |
| 点边缘区域（设置项） | 翻页 | 翻页 | 翻页 | 关闭卡片 |

"下一片段"走到页尾时，自动翻页并聚焦新页的第一个片段。
边缘点击翻页：手机上默认关闭，e-ink 主题下默认打开。打开后页边距加宽，确保边缘区域里没有文字（这属于排版参数变化）。
点击吸附：点在词间空隙时，吸附到最近的词。默认行距为 1.7。

### 11.3 词卡
内容依次为：标题（短语或原形）、🔊（v0.2）、☆、词形说明（took → take · 短语）、本句含义（LLM）、词典释义（折叠）、按钮"只看 X"和"整句翻译"。
最高占屏幕 40%，上滑展开成全屏，下滑或点击外部关闭。命中短语时默认显示短语，并在正文里高亮短语的各个组成词（中间插入的词不高亮）。

### 11.4 Focus
三层显示：其他文字变暗，当前句正常，当前片段加浅色底纹。推进单位可选句子或意群（默认句子）。
控制条：◀ 上一片段 / 译（字幕开关）/ ▶ 下一片段 / ▷ 播放（v0.2）。
字幕浮层显示整句译文（跨页时也显示整句），放置规则同 11.1 第 5 条，并预取后面 3 句的译文。

### 11.5 平板和桌面
平板横屏时双栏分页，词卡改成锚定在词旁边的浮窗。桌面端词卡放在右侧边栏。快捷键：空格下一片段、←/→ 翻页、T 整句翻译、F 切换 Focus。状态机和手势规则全部共用。

## 12. 主题
浅色、深色、护眼、e-ink。e-ink 主题的规则：不用任何动画和过渡；不用阴影和半透明，用边框区分层次；Focus 不用变暗，当前句加粗下划线，当前片段用边框框出；加载时显示静态文字"加载中…"。

## 13. 播放引擎（v0.2 契约）
```ts
interface PlaybackEngine {
  play(from: Locator): Promise<void>;
  pause(): void; resume(): void; stop(): void;
  next(): void; prev(): void;
  setRate(rate: number): void; setVoice(voiceId: string): void;
  getState(): Promise<{ status: 'idle' | 'playing' | 'paused'; sentenceId?: string; offset?: number }>;
  on(event: 'sentenceStart', cb: (e: { sentenceId: string }) => void): void;
  on(event: 'boundary', cb: (e: { sentenceId: string; start: number; end: number }) => void): void;
  on(event: 'stateChange' | 'ended', cb: (e: unknown) => void): void;
}
```
原生层直接从 sentences 表读取播放队列，可以跨章节播放。Web 层只负责显示：收到 boundary 事件时，如果读到的位置超出当前页，就翻页。App 回到前台时调用 getState() 对齐位置。Web 实现是行为基准。
三档 TTS（系统 / 云端 / 端侧）都实现同一个"按句合成"接口。

## 14. 设置默认值
| 设置项 | 默认值 |
|---|---|
| 释义来源 | 联网优先 |
| 点词时请求本句含义 | 自动 |
| 预处理 | 仅 Wi-Fi，当前章往后 1 章（v0.2） |
| 生词词频阈值 | 待 M2 用数据确定 |
| Focus 推进单位 | 句子 |
| 字幕 | 开 |
| 边缘点击翻页 | 关（e-ink 主题下为开） |
| 关闭词卡后继续播放 | 是（v0.2） |

## 15. 同步预留
用户数据表都带 UUIDv7、updatedAt、deletedAt。书内实体用确定性 ID。冲突策略以后再定，候选方案是 last-write-wins（按字段或按记录）。

## 16. 安全与隐私
API key 只存 Keychain。请求只发往用户配置的 baseURL。书籍内容只在调用 LLM 时，把相关句子发给用户自己选择的服务商；设置页要明确说明这一点。

## 17. 决策记录
| 决策 | 理由 |
|---|---|
| Web 内核 + Capacitor，不用 Flutter/RN | 逐词可点的富文本和 epub 在 DOM 里最成熟 |
| 客户端不用 Next.js | 本地离线 App 用不到 SSR |
| epub 规范化后自己渲染 | Focus、高亮、e-ink、TTS 共用同一份可控的数据 |
| 纯文本 + 区间标记 | 分句、定位、高亮、注音共用同一套偏移 |
| 固定分页，Focus 去适应分页 | 保持读书感和位置记忆；适合 e-ink |
| 字幕做成浮层，页脚高度固定 | 不触发重新分页 |
| 原生播放模块 | iOS 在后台会挂起 WebView |
| ECDICT 内置，mdx 由用户导入 | 商业化需要开放授权 |
| 短语识别：词典匹配为主，LLM 增强 | 离线可用，成本低 |
| 确定性书内 ID | 多设备导入同一本书时，定位和生词能对上 |
| 最低 iOS 17.2 | 依赖 CSS Custom Highlight API |