# OneWIFI UI 设计语言描述词

> 用途：完整替换现有界面风格时的统一描述词。
> 来源：从 `assets/social-preview.svg` 逆向提炼，覆盖 WebUI 全部 11 个页面。
> 所有颜色、字号、圆角均为可直接落地的精确值，非模糊形容词。

---

## 一、核心母题（所有页面通用，必须逐字复用）

### 中文描述词

深空蓝黑（#071723）为底的自托管网络设备控制台，界面呈"深邃海军蓝 + 冰蓝渐变"气质。
画面右上角有一团柔和的蓝色径向光晕（#168CFF，25% 不透明度），背景上叠加极淡的网格线
（#7CB9D5，18% 不透明度）作为科技质感，但不喧宾夺主。内容区左对齐，留出宽裕的左边距，
标题使用 Inter 字体特粗字重（760），双层大标题分行排布，字色为冰白（#F4FBFF）。
信息以"悬浮深色卡片"组织：卡片填充 #0D293D，1 像素边框 #25516A，圆角 16–30px，
并带一团大而柔的投影（垂直偏移 16px、模糊 22px、近黑 #020B12、45% 不透明度），
使卡片明显浮离背景。卡片内嵌次级面板填充 #102E42。
品牌色为一支从亮蓝（#168CFF）到薄荷绿（#20D9AE）的 45° 线性渐变，
只用于品牌标识、图标圆环、关键状态与主按钮，绝不大面积铺色。
文字分三级：主文字冰白 #F4FBFF，次级文字雾蓝 #8EACBE / #A8C2D1，标签与英文小字用雾蓝。
图标一律为"渐变圆环或实心圆 + 16% 同色底晕 + 薄荷描边"的符号风格。
整体感受：专业、克制、可信赖的自托管基础设施工具，深色但不沉闷，靠渐变与光晕提气。

### English master prompt（AI 绘图工具用）

Deep-space navy-black (#071723) self-hosted network appliance console UI, dark theme,
soft radial blue glow (#168CFF at 25% opacity) in the upper-right corner, faint technical
grid lines (#7CB9D5 at 18% opacity) overlaying the background. Generous left margin,
left-aligned layout. Inter typeface, extra-bold 760 weight headlines on two lines,
ice-white text (#F4FBFF). Content organized as floating dark cards: fill #0D293D,
1px border #25516A, 16-30px corner radius, large soft drop shadow (0px 16px 22px,
#020B12 at 45% opacity) so cards clearly lift off the background. Nested inner panels
filled #102E42. Brand color is a 45-degree linear gradient from bright blue #168CFF to
mint green #20D9AE, used ONLY for the logo, icon rings, key status and primary buttons,
never as large area fill. Three-level text hierarchy: primary ice-white #F4FBFF, secondary
haze-blue #8EACBE and #A8C2D1 for labels and small English text. Icons are gradient rings
or solid circles with a 16% same-color halo and mint stroke. Professional, restrained,
trustworthy infrastructure tool aesthetic; dark but never dull, lifted by gradient and glow.

---

## 二、设计变量表（Design Tokens）

### 色彩

| 用途 | 变量 | 值 |
|---|---|---|
| 页面底色 | `--bg-void` | `#071723` |
| 悬浮卡片底 | `--bg-panel` | `#0D293D` |
| 卡片边框 | `--border-panel` | `#25516A` |
| 内嵌面板底 | `--bg-inset` | `#102E42` |
| 标识方块底 | `--bg-tile` | `#081A29` |
| 品牌渐变起 | `--brand-from` | `#168CFF` |
| 品牌渐变止 | `--brand-to` | `#20D9AE` |
| 主文字 | `--text-primary` | `#F4FBFF` |
| 次文字 | `--text-secondary` | `#8EACBE` |
| 弱文字 | `--text-tertiary` | `#A8C2D1` |
| 薄荷强调 | `--accent-mint` | `#B8F8EC` |
| 网格线 | `--grid-line` | `#7CB9D5` @ 18% |
| 光晕 | `--glow` | `#168CFF` @ 25% |
| 投影 | `--shadow-panel` | `0 16px 22px #020B12 @ 45%` |

### 字体（Inter / Arial / sans-serif）

| 层级 | 字号 | 字重 | 颜色 |
|---|---|---|---|
| 页面大标题 | 51px | 760 | `#F4FBFF` |
| 卡片标题 | 20px | 600 | `#F2F9FD` |
| 区段标签 | 15px | 700 | `#8EACBE` |
| 品牌字标 | 29px | 750 | `#F4FBFF` |
| 英文眉题 | 17px | 400 | `#8EACBE` |
| 徽标胶囊 | 17px | 650 | `#B9D4E2` |

英文眉题与眉标一律**大写 + 字母间距**，如 `SELF-HOSTED · MULTI-SIM · ARM64`。

### 几何与效果

| 项 | 值 |
|---|---|
| 卡片圆角 | 大圆角：外层 30px，卡片 16–20px，胶囊 23px |
| 图标方块 | 78×78px，圆角 20px |
| 信息卡 | 78×62px，圆角 16px |
| 主图面板 | 420×384px，圆角 30px |
| 徽标胶囊 | 142×46px，圆角 23px（全圆端） |
| 卡片投影 | `0 16px 22px #020B12 @ 45%` |
| 边框 | 1px `#25516A`，绝不使用粗边框 |

---

## 三、页面级描述词（11 个页面）

> 用法：每页 = 「核心母题」+ 本节对应的页面描述。母题部分不要重复写，AI 绘图时把英文母题
> 与页面英文段拼接成一条完整提示词。

### 1. Overview / 概览

顶部一行四个统计胶囊（142×46px，圆角 23px，底 #102E42，边 #25516A，文字 #B9D4E2，字重 650），
分别为「4 条线路 · 2 台设备 · 1 个国家出口 · 运行 12 天」。下方是左右分栏：
左侧两行特粗大标题「Your SIMs. Your gateway. / Your network paths.」（51px / 760），
标题下一行雾蓝眉题 `SELF-HOSTED · MULTI-SIM · ARM64`；右侧是一张 420×384px 圆角 30px 的
悬浮主面板（底 #0C2434，边 #25516A 2px，投影按母题），面板内是三段自上而下的流程条
（352×62/80px，圆角 16px，底 #102E42），依次为：
① 渐变圆点 + 「Physical SIM / eSIM」+ 小字「Keys remain on the secure element」
② 蓝色圆点 + 「Modem / PC-SC reader」+ 小字「Cellular data and VoWiFi control」
③ 「IMS + isolated country TUN」+ 小字「Calls · SMS · Web console · Egress」，
右侧配一个 16% 薄荷底晕加薄荷描边的圆形对勾。
流程条之间用薄荷绿（#20D9AE）3px 圆头竖线与向下小箭头连接。

**English:** Dashboard top row with four pill stat badges (142x46px, radius 23px, fill #102E42,
stroke #25516A, text #B9D4E2 weight 650): "4 lines", "2 devices", "1 country exit", "12 days uptime".
Below, two-column split. Left: two-line extra-bold headline "Your SIMs. Your gateway. /
Your network paths." at 51px/760, with haze-blue eyebrow "SELF-HOSTED · MULTI-SIM · ARM64".
Right: one floating 420x384px panel radius 30px, fill #0C2434, stroke #25516A 2px, containing a
three-step vertical flow of rounded bars (352x62/80px, radius 16px, fill #102E42): gradient dot
"Physical SIM / eSIM" + "Keys remain on the secure element"; blue dot "Modem / PC-SC reader" +
"Cellular data and VoWiFi control"; "IMS + isolated country TUN" + "Calls · SMS · Web console ·
Egress" with a mint 16%-halo circle checkmark. Steps joined by 3px mint #20D9AE vertical lines
with small down arrows.

### 2. Devices / 设备管理

一张全宽悬浮卡片（圆角 20px）内纵向排列设备行，每行高 62px、圆角 16px、底 #102E42。
每行结构：左侧渐变圆点状态灯（在线为 #20D9AE，离线为雾蓝 #8EACBE 40%），
中间主文字设备名「Quectel EC200U · ttyUSB2」（20px/600），下方小字雾蓝
「IMEI 86xxxxxxxxxxxx1 · 信号 -71 dBm」；右侧两枚胶囊徽标「VoWiFi」与「4G」，
在线徽标文字薄荷 #B8F8EC，离线徽标文字 #8EACBE。行与行之间留 12px 间隙，不用分割线。

**English:** One full-width floating card (radius 20px) containing vertical device rows, each 62px
tall, radius 16px, fill #102E42. Each row: left gradient status dot (online #20D9AE, offline #8EACBE
at 40%), center device name "Quectel EC200U · ttyUSB2" at 20px/600 with sub-line haze-blue
"IMEI 86xxxxxxxxxxxx1 · signal -71 dBm", right two pill badges "VoWiFi" and "4G" — mint #B8F8EC when
online, #8EACBE when offline. 12px gaps between rows, no divider lines.

### 3. Calls / 通话

左右分栏。左侧通话记录列表（悬浮卡片内）：每行左侧一个渐变圆环图标（中间是本机号码首字），
主文字「+86 138 **** 8888」，小字雾蓝「今天 14:32 · 12 分 08 秒 · VoWiFi」；
行尾一枚状态胶囊「已接」用薄荷文字，「未接」用雾蓝文字，「未播放留言」额外加一枚
临界红点徽标（唯一允许的非品牌色，仅用于未播放留言提示）。右侧一张 420×384px 面板，
内嵌一台浏览器软电话：渐变圆环拨号盘、大字本机号码、三枚圆形按键（接听／拒绝／挂断），
按键为 16% 渐变底晕 + 渐变描边。

**English:** Two-column split. Left, call log list inside a floating card: each row has a gradient
ring icon with the number's first character, main text "+86 138 **** 8888", sub-line haze-blue
"Today 14:32 · 12m 08s · VoWiFi"; trailing status pill "Answered" in mint #B8F8EC, "Missed" in
#8EACBE, and unplayed voicemail rows carry a single critical red dot badge (the only non-brand
color permitted, reserved for unplayed voicemail alerts). Right, a 420x384px panel holding a browser
softphone: gradient ring dial pad, large local number, three round keys (answer / reject / hang up)
drawn as 16% gradient halo with gradient stroke.

### 4. Messages / 短信

仿消息线程的三段式列表（悬浮卡片内）。每段：顶部一行联系人名（20px/600）与时间（雾蓝 17px），
下方 1–2 条气泡，发出方气泡为渐变描边 + 16% 渐变底晕、圆角 16px、文字冰白；
接收方气泡为 #102E42 填充、无渐变、圆角 16px、文字 #A8C2D1。
线程未读时左侧加一条 3px 薄荷竖线。底部固定一枚全宽主按钮「新短信」，
唯一使用品牌渐变实底（#168CFF → #20D9AE）的地方，文字深蓝黑 #071723，圆角 23px。

**English:** Three-part message-thread list inside a floating card. Each thread: header row with
contact name (20px/600) and timestamp (haze-blue 17px), then 1-2 bubbles. Outbound bubbles use
gradient stroke plus 16% gradient halo, radius 16px, ice-white text; inbound bubbles use flat
#102E42 fill, no gradient, radius 16px, #A8C2D1 text. Unread threads get a 3px mint left bar.
Pinned at the bottom, one full-width primary button "New message" — the ONLY place the brand
gradient is used as a solid fill (#168CFF to #20D9AE) — text deep navy-black #071723, radius 23px.

### 5. Contacts / 通讯录

上下结构：顶部一枚搜索框（圆角 23px 全圆端，底 #102E42，边 #25516A，占位文字 #8EACBE），
下方通讯录列表。联系人行高 62px、圆角 16px、底 #102E42，
左侧为渐变圆环头像（环内是姓名首字，环为 #168CFF → #20D9AE 2px 描边，环内 16% 渐变底晕），
主文字姓名（20px/600），小字号码（雾蓝）；行尾一枚小号圆形按键（渐变描边）
承载「呼叫」与「短信」两个动作，点击态为 16% 渐变底晕填充。

**English:** Vertical stack: a search field on top (radius 23px fully rounded, fill #102E42, stroke
#25516A, placeholder #8EACBE), then the contact list. Contact rows 62px tall, radius 16px, fill
#102E42, each with a gradient ring avatar (ring is a 2px #168CFF to #20D9AE stroke, inside a 16%
gradient halo and the contact's initial), name at 20px/600, number in haze-blue; on the right two
small round action keys with gradient stroke for "call" and "message", active state filled with the
16% gradient halo.

### 6. eSIM / eSIM

一张主面板（圆角 30px）内分三区。第一区「eUICC 芯片」：左侧 78×78px 图标方块
（圆角 20px，底 #0D293D，边 #25516A，中心为渐变圆环），右侧两行——主文字
「eUICC ID: 89 44 ... 21」、小字雾蓝「SGP.02 v2.2 · 剩余可装载 3 个 Profile」。
第二区 Profile 列表：每行 62px 圆角 16px 底 #102E42，主文字运营商名「China Unicom IoT」，
小字「ICCID 98 ... 0001 · 数据 128 MB」；行尾状态胶囊「已启用」薄荷文字／「已禁用」雾蓝文字。
第三区两枚并排操作按钮：一枚渐变实底主按钮「下载 Profile」（文字 #071723）与一枚
幽灵按钮（透明底、1px #25516A 边、冰白文字）「刷新」。

**English:** One main panel (radius 30px) split into three zones. Zone 1 "eUICC chip": left a 78x78px
icon tile (radius 20px, fill #0D293D, stroke #25516A, gradient ring centered), right two lines —
primary "eUICC ID: 89 44 ... 21" and haze-blue sub "SGP.02 v2.2 · 3 Profiles remaining". Zone 2
Profile list: rows 62px radius 16px fill #102E42, carrier name "China Unicom IoT" at primary style
with sub "ICCID 98 ... 0001 · data 128 MB"; trailing status pill "Enabled" in mint, "Disabled" in
haze-blue. Zone 3 two side-by-side buttons: one solid gradient primary "Download profile" (text
#071723) and one ghost button (transparent fill, 1px #25516A stroke, ice-white text) "Refresh".

### 7. Balance & keeping / 余额与保号

两栏。左栏一张余额卡（圆角 30px，底 #0C2434）：大号数字「¥ 38.60」用 51px/760 特粗，
上方眉题 `CURRENT BALANCE`（17px 雾蓝大写带字距），下方一行小字「China Mobile · 更新于今天 09:15」，
底部三枚胶囊「本月已用 62 MB」「短信余 412 条」「保号周期 30 天」。
右栏保号任务列表（悬浮卡片内）：每行左侧渐变圆环时钟图标，主文字任务名「每日 10:00 发送查询短信」，
小字「目标 10086 · 下次 10 小时后」；行尾一枚开关，开启态为渐变实底圆钮，关闭态为 #25516A 边圆钮。

**English:** Two columns. Left, a balance card (radius 30px, fill #0C2434): large figure "CNY 38.60"
at 51px/760 extra-bold, eyebrow "CURRENT BALANCE" above it (17px haze-blue uppercase, letter-spaced),
sub-line "China Mobile · updated today 09:15", and three pills at the bottom "62 MB used this month",
"412 SMS left", "30-day keeping cycle". Right, the keeping-task list inside a floating card: each
row has a gradient ring clock icon, primary task name "Daily 10:00 query SMS", sub "To 10086 · next in
10 hours"; trailing a toggle, on-state a solid gradient knob, off-state a knob ringed by #25516A.

### 8. Network exits / 网络出口

一张主面板（圆角 30px）内为国家出口矩阵。每行代表一个国家（62px 圆角 16px 底 #102E42）：
最左侧国家代码胶囊「JP」「US」「HK」（圆角 23px，渐变描边，文字薄荷）；
主文字国家名「日本 · Tokyo」，小字「节点 3 个 · SOCKS5 :1080 · UDP ✓」；
行尾一枚状态胶囊「就绪」薄荷文字、「未就绪」雾蓝文字，并在就绪行加一枚 16% 薄荷底晕对勾。
面板底部一行汇总：眉题 `EGRESS POLICY`，正文「仅 VoWiFi/ePDG 流量走向所选出口，
其余流量直连，出口不通时不泄漏。」文字用 #A8C2D1。

**English:** One main panel (radius 30px) holding a country-exit matrix. Each row is a country
(62px, radius 16px, fill #102E42): leftmost a country code pill "JP" / "US" / "HK" (radius 23px,
gradient stroke, mint text), primary country name "Japan · Tokyo", sub "3 nodes · SOCKS5 :1080 ·
UDP OK"; trailing a status pill "Ready" in mint / "Not ready" in haze-blue, with ready rows also
carrying a 16% mint halo checkmark. Panel footer: eyebrow "EGRESS POLICY" and body text in #A8C2D1 —
"Only VoWiFi/ePDG traffic follows the selected exit; all other traffic stays direct; nothing leaks
when an exit is down."

### 9. Notifications / 通知

左右分栏。左栏渠道列表（悬浮卡片内）：每行 62px 圆角 16px 底 #102E42，
左侧渠道图标方块（78×78 缩小为 36×36，圆角 12px，渐变描边），主文字渠道名「Telegram」，
小字「Bot @onewifi_gw · 已连接」；行尾为开启态开关（渐变实底圆钮）。
右栏事件订阅矩阵：主面板内为一张表格，行是事件（未接来电／新留言／线路离线／余额不足／新版本），
列是渠道；开启单元格为渐变实底小圆点，关闭为 #25516A 空心圆点。表头行文字用 15px/700 #8EACBE。

**English:** Two-column split. Left, channel list inside a floating card: rows 62px radius 16px fill
#102E42, each with a channel icon tile (36x36, radius 12px, gradient stroke), primary channel name
"Telegram", sub "Bot @onewifi_gw · connected"; trailing an on-state toggle with solid gradient knob.
Right, the event-subscription matrix: a table inside a main panel, rows are events (missed call / new
voicemail / line offline / low balance / new release), columns are channels; enabled cells are solid
gradient dots, disabled are hollow #25516A dots. Header row text at 15px/700 #8EACBE.

### 10. System settings / 系统设置

上下结构的表单页。分组用区段标签（15px/700 #8EACBE 大写带字距）分隔，如 `IDENTITY`、`NETWORK`、
`UPDATES`、`BACKUP`。每个设置项一行：左侧标签（20px/600 冰白）与说明小字（雾蓝），
右侧控件。输入框为圆角 16px、底 #102E42、边 #25516A、文字冰白、占位 #8EACBE；
下拉与开关同第五节规则。页面底部两枚按钮并排：渐变实底主按钮「保存」（文字 #071723）与
幽灵按钮「恢复默认」。所有分组包裹在圆角 30px 悬浮面板内，面板之间留 24px 间隙。

**English:** Vertically stacked form page. Groups separated by section labels (15px/700 #8EACBE,
uppercase, letter-spaced) such as IDENTITY, NETWORK, UPDATES, BACKUP. Each setting row: left the label
(20px/600 ice-white) with a haze-blue description below, right the control. Inputs are radius 16px,
fill #102E42, stroke #25516A, ice-white text, #8EACBE placeholder; selects and toggles follow the
earlier rules. Page footer has two buttons side by side: a solid gradient primary "Save" (text
#071723) and a ghost button "Restore defaults". All groups sit inside radius-30px floating panels with
24px gaps between panels.

### 11. Diagnostics / 诊断

一张主面板（圆角 30px）内三段。第一段健康度汇总：左侧一枚大号渐变圆环进度环
（环为 3px #168CFF → #20D9AE，环心大字「92」51px/760），右侧三枚胶囊
「主机 · 正常」「出口 · 1 异常」「更新 · 最新」，异常胶囊文字用雾蓝并附一枚小红点。
第二段诊断日志：等宽字体、15px、#A8C2D1 文字，行首时间戳雾蓝，
关键字高亮用薄荷 #B8F8EC（如 `ok`、`ready`），异常行整行文字提亮为 #F4FBFF。
第三段两枚按钮：幽灵按钮「导出诊断包」与渐变实底主按钮「重新检测」。

**English:** One main panel (radius 30px) with three sections. Section 1 health summary: left a large
gradient ring progress meter (3px ring #168CFF to #20D9AE) with big "92" at 51px/760 in its center;
right three pills "Host · OK", "Exits · 1 issue", "Updates · latest", the issue pill in haze-blue with
a small red dot. Section 2 diagnostic log: monospace 15px, #A8C2D1 text, haze-blue timestamps at line
start, keyword highlighting in mint #B8F8EC (e.g. "ok", "ready"), anomaly lines brightened to #F4FBFF.
Section 3 two buttons: ghost "Export diagnostic bundle" and solid gradient primary "Re-run checks".

---

## 四、组件与状态描述词

### 登录页（auth）

居中单卡，无侧栏。卡片圆角 30px，底 #0C2434，边 #25516A 2px，按母题投影。
卡片顶部：一枚 78×78px 图标方块（圆角 20px，底 #0D293D，边 #25516A）内放渐变圆环，
其下是 `OneWIFI` 字标（29px/750 冰白），再下是眉题 `SELF-HOSTED MULTI-SIM CONSOLE`
（17px 雾蓝大写带字距）。表单两个输入框（用户名／密码）圆角 16px、底 #102E42、边 #25516A。
一枚全宽渐变实底主按钮「登录」，文字 #071723，圆角 23px。错误提示文字用 #A8C2D1，
仅在输入框下方出现，不弹窗。

**English:** Centered single card, no sidebar. Card radius 30px, fill #0C2434, stroke #25516A 2px,
master shadow. Top of card: a 78x78px icon tile (radius 20px, fill #0D293D, stroke #25516A) holding a
gradient ring, below it the "OneWIFI" wordmark (29px/750 ice-white), then the eyebrow "SELF-HOSTED
MULTI-SIM CONSOLE" (17px haze-blue uppercase letter-spaced). Two inputs (username / password) radius
16px, fill #102E42, stroke #25516A. One full-width solid gradient primary button "Sign in", text
#071723, radius 23px. Error text in #A8C2D1, shown only under the input, never as a modal.

### 侧边导航

宽约 240px，底色比页面更深一档 #081A29，右侧 1px 边 #25516A。
顶部品牌区：36×36 渐变圆环 + 主机名（20px/600）+ 两枚徽标（连接态薄荷／异常雾蓝）。
导航项高 44px、圆角 16px，选中态为 16% 渐变底晕 + 渐变文字，未选中为 #A8C2D1 文字。
「留言」项带未读数徽标（16% 渐变底晕圆点 + 薄荷数字）。
底部一条版本行 `v1.14.0`（15px 雾蓝）与 GitHub / Star 两个小图标键。

**English:** About 240px wide, one shade deeper than the page at #081A29, 1px right border #25516A.
Brand area on top: 36x36 gradient ring + hostname (20px/600) + two status badges (mint when
connected, haze-blue when degraded). Nav items 44px tall, radius 16px; selected state uses a 16%
gradient halo with gradient text, unselected uses #A8C2D1 text. The "messages" item carries an unread
badge (16% gradient halo dot with a mint number). Bottom: a version line "v1.14.0" (15px haze-blue)
and two small icon keys for GitHub / Star.

### 亮色模式（可选扩展）

若需亮色版，保持同一套结构，仅换底：页面 #F2F7FB、卡片 #FFFFFF、边框 #D3E3EE、
内嵌面板 #EAF2F8、主文字 #0A1F2E、次文字 #4A6B7E、品牌渐变不变。
**亮色下禁止加深色投影**，改用 `0 2px 8px rgba(10,31,46,.08)`。

**English:** For an optional light variant, keep the identical structure and only swap the surfaces:
page #F2F7FB, card #FFFFFF, border #D3E3EE, inset #EAF2F8, primary text #0A1F2E, secondary #4A6B7E;
the brand gradient stays unchanged. In light mode the heavy dark shadow is forbidden — use
`0 2px 8px rgba(10,31,46,.08)` instead.

---

## 五、负面约束（保持统一的关键，写提示词时务必带上）

以下每条都要作为负面提示追加，否则 AI 会交出风格不一致的图：

1. **不用纯黑 #000000 做底**，底色必须是带蓝调的 #071723。
2. **不用白底或浅色卡片**，这是一套深色界面。
3. **品牌渐变不得大面积铺色**，只能用于标识、图标圆环、关键状态、主按钮。
4. **不加霓虹色、紫色、橙色、粉色**，整套只有蓝—薄荷一支渐变加雾蓝中性色。
5. **不用粗边框**，边框统一 1px #25516A。
6. **不用尖锐直角**，最小圆角 12px，主圆角 16–30px。
7. **不用毛玻璃 / 强模糊背景**，层次靠底色明度差与柔和投影，不靠模糊。
8. **不用复杂插画、3D 人物、照片背景**，保持工具感与信息密度。
9. **文字不得溢出卡片**，层级必须遵守三级文字色。
10. **红色仅允许出现在"未播放留言 / 临界告警"两处**，且只做小圆点，不做大面积告警条。

**English negative prompt:** `no pure black background, no white or light cards, no neon colors,
no purple, no orange, no pink, no large-area gradient fills, no thick borders, no sharp corners,
no glassmorphism, no heavy blur, no illustrations, no 3D characters, no photo backgrounds,
no text overflow, no red alert banners, flat minimal, dark navy UI`

---

## 六、落地建议

- **一条提示词模板**：`[英文母题] + [页面英文段] + [负面提示]`，三段拼成一条，出图稳定性最高。
- **批量出图时**先固定随机种子，再逐页替换页面段，可保证 11 个页面风格完全一致。
- **要落到代码**时，把「设计变量表」直接写成 CSS 自定义属性（变量名已按 `--` 规范给好），
  替换 `webui/src` 下的主题定义即可，组件尺寸与投影值已给出，不需要重新设计。
- 描述词中的示例数据（IMEI、ICCID、号码、金额）均为虚构，实际使用时替换为脱敏演示数据，
  不要带入真实用户信息。
