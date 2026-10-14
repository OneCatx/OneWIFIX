# OneWIFI 主题交付与接入文档（供 Grok 接入第二套主题）

> 版本：2026-10-14 · 仓库：`E:/GQ/Ultra/mdd-sim-gateway`
> 主题源文件：`onewifi-theme.css`（仓库根目录，1692 行 / 59.7 KB，CRLF）
> 预览页：`onewifi-theme-preview.html`（仓库根目录，双击即可看双主题效果）
> 设计规范（上游输入）：`docs/design/onewifi-ui-design-language.md`

本文档是给接入方（Grok 或任何 AI / 工程师）的完整交接说明：主题怎么构成、
怎么接进构建、怎么改出第二套主题、怎么验证。**所有色值、选择器、命令都可直接复制。**

---

## 1. 一句话结论

OneWIFI 主题是一个**纯 CSS 覆盖层**：不改任何 Vue 组件与模板，只覆写上游
24 层 CSS 的设计令牌（CSS 自定义属性），外加少量组件级规则处理上游硬编码。
因此它与现有架构完全解耦，接入成本 = 拷一个文件 + 加一行 import。

---

## 2. 交付物清单

| 文件 | 作用 | 是否入库 |
|---|---|---|
| `onewifi-theme.css` | 主题唯一真源（根目录） | 新文件 |
| `webui/src/assets/onewifi-theme.css` | 构建副本，与真源 `diff` 必须为空 | 新文件 |
| `onewifi-theme-preview.html` | 本地预览页（按 main.js 真实顺序加载全部上游 CSS + 主题） | 新文件 |
| `webui/src/main.js` | 最后一个 CSS import 之后接入主题 | 已改 |
| `webui/index.html` | 首帧 boot-critical 配色 + 两个 `theme-color` meta | 已改 |
| `webui/src/stores/theme.js` | `THEME_COLORS` 同步为首帧色 | 已改 |
| `webui/public/manifest.webmanifest` | `background_color` / `theme_color` | 已改 |
| `webui/src/views/Login.vue` | 品牌名 OneBoard → OneWIFI | 已改 |
| `webui/src/components/Sidebar.vue` | 侧栏徽标 OneBoard → OneWIFI | 已改 |
| `webui/src/components/ControlPlaneHero.vue` | Hero 副标题品牌名 | 已改 |

> ⚠️ 根目录 `onewifi-theme.css` 是**唯一真源**；`webui/src/assets/` 下那份只是构建副本。
> 改完根目录文件必须 `cp onewifi-theme.css webui/src/assets/onewifi-theme.css`。
> 仓库文本文件是 **CRLF** 行尾，用 Python 改写必须 `open(..., newline="")`。

---

## 3. 设计令牌（直接复制用）

### 3.1 品牌令牌（`:root`，上游未定义）

```css
:root {
  --ow-brand-from: #168CFF;              /* 冰蓝 */
  --ow-brand-to:   #20D9AE;              /* 薄荷 */
  --ow-brand-gradient: linear-gradient(135deg, #168CFF 0%, #20D9AE 100%);
  --ow-brand-halo: linear-gradient(135deg, rgba(22,140,255,.16), rgba(32,217,174,.16));
  --ow-brand-halo-solid: #123A52;
  --ow-mint: #B8F8EC;                    /* 高亮薄荷（ONEWIFI 字标 / 激活态） */
  --ow-grid-line: #7CB9D5;

  --ow-bg-void: #071723;                 /* 页面最底（深空） */
  --ow-bg-sidebar: #081A29;
  --ow-panel: #0D293D;                   /* 卡片 / 面板主色 */
  --ow-panel-deep: #0C2434;              /* 登录卡等需要再沉一级的表面 */
  --ow-inset: #102E42;                   /* 输入框 / 内嵌槽 */
  --ow-border: #25516A;
  --ow-border-strong: #2F6B8A;           /* hover 边 */

  --ow-text-1: #F4FBFF;                  /* 主文字（近白带冰） */
  --ow-text-2: #A8C2D1;
  --ow-text-3: #8EACBE;
  --ow-text-4: #6F92A6;                  /* 占位 / 禁用 */

  --ow-shadow: 0 16px 22px rgba(2,11,18,.45);      /* 卡片主投影 */
  --ow-shadow-soft: 0 6px 16px rgba(2,11,18,.32);

  --ow-radius-card: 20px; --ow-radius-panel: 28px; --ow-radius-pill: 23px;
}
```

### 3.2 深色一级令牌（`[data-theme="dark"]`）

```css
[data-theme="dark"] {
  --bg-base: #071723;  --bg-surface: #0D293D;  --bg-card: #0D293D;
  --bg-card-hover: #14344A;  --bg-input: #102E42;  --bg-hover: #14344A;
  --border-subtle: #25516A;  --border-field: #25516A;  --border-glass: #25516A;

  /* 玻璃层整体退化：OneWIFI 不用模糊与内描光 */
  --glass-blur: 0px;  --glass-blur-size: 0px;  --glass-saturate: 100%;
  --glass-highlight: none;  --glass-rim: none;
  --glass-shadow-ambient: none;  --glass-shadow-inset: none;
  --glass-shadow: 0 16px 22px rgba(2,11,18,.45);
  --glass-card: #0D293D;  --glass-card-soft: #102E42;  --glass-card-lift: #14344A;
  --glass-card-accent: rgba(22,140,255,.12);
  --glass-border: #25516A;  --glass-border-soft: rgba(124,185,213,.18);
  --glass-border-accent: rgba(32,217,174,.35);  --glass-shell: #0D293D;
  --shell-bg: #0D293D;  --shell-border: #25516A;
  --shell-shadow: 0 16px 22px rgba(2,11,18,.45);

  --sidebar-bg: #081A29;  --sidebar-divider: #25516A;
  --sidebar-nav-hover-bg: #14344A;  --sidebar-nav-active-bg: var(--ow-brand-halo), var(--ow-brand-halo-solid);
  --sidebar-nav-active-color: #B8F8EC;  --sidebar-nav-active-border: rgba(32,217,174,.35);
  --sidebar-nav-active-shadow: none;

  --stat-card-bg: #0D293D;  --stat-card-border: #25516A;
  --stat-card-shadow: 0 16px 22px rgba(2,11,18,.45);
  --stat-card-shadow-hover: 0 20px 28px rgba(2,11,18,.5);
  --stat-label-color: #8EACBE;  --stat-value-color: #F4FBFF;  --stat-sub-color: #A8C2D1;
  --stat-glass-blur: 0px;
  --stat-wave-stroke: rgba(32,217,174,.55);
  --stat-wave-fill-top: rgba(22,140,255,.16);  --stat-wave-fill-bottom: rgba(22,140,255,0);

  --region-card-bg: #102E42;
  --region-scrim: linear-gradient(to right, rgba(7,23,35,.88), rgba(7,23,35,0));

  /* 语义色：整体收敛到「蓝—薄荷」一支，其余色相只做弱点缀 */
  --accent: #168CFF;  --accent-hover: #3AA0FF;
  --accent-soft: rgba(22,140,255,.16);  --accent-muted: rgba(22,140,255,.55);
  --purple: #7C9CFF;  --green: #20D9AE;  --orange: #F5A65B;  --pink: #F27EB3;  --cyan: #20D9AE;
  --success: #20D9AE;  --warning: #F5A65B;  --danger: #ef4444;  --info: #168CFF;

  --text-primary: #F4FBFF;  --text-secondary: #A8C2D1;
  --text-muted: #8EACBE;  --text-disabled: #6F92A6;
  --toggle-bg: #25516A;  --thumb-shadow: 0 2px 6px rgba(2,11,18,.45);

  --radius-shell: 28px;  --radius-panel: 24px;  --radius-card: 20px;
  --radius-card-sm: 16px;  --radius-lg: 22px;  --radius-md: 14px;
  --fs-base: 12.5px;
  color-scheme: dark;
}
```

### 3.3 浅色一级令牌（`[data-theme="light"]`）

结构不变、只换表面；**品牌渐变保持一致**。

```css
[data-theme="light"] {
  --bg-base: #F2F7FB;  --bg-surface: #FFFFFF;  --bg-card: #FFFFFF;
  --bg-card-hover: #EAF2F8;  --bg-input: #EAF2F8;  --bg-hover: #E4EFF6;
  --border-subtle: #D3E3EE;  --border-field: #D3E3EE;  --border-glass: #D3E3EE;

  --glass-blur: 0px;  --glass-blur-size: 0px;  --glass-saturate: 100%;
  --glass-highlight: none;  --glass-rim: none;  --glass-shadow-ambient: none;
  --glass-shadow-inset: none;  --glass-shadow: 0 2px 8px rgba(10,31,46,.08);
  --glass-card: #FFFFFF;  --glass-card-soft: #EAF2F8;  --glass-card-lift: #FFFFFF;
  --glass-card-accent: rgba(22,140,255,.08);
  --glass-border: #D3E3EE;  --glass-border-soft: #E4EFF6;
  --glass-border-accent: rgba(22,140,255,.28);  --glass-shell: #FFFFFF;
  --shell-bg: #FFFFFF;  --shell-border: #D3E3EE;
  --shell-shadow: 0 2px 8px rgba(10,31,46,.08);
  --sidebar-bg: #FFFFFF;  --sidebar-divider: #D3E3EE;
  --sidebar-nav-hover-bg: #E4EFF6;  --sidebar-nav-hover-color: #0A1F2E;
  --sidebar-nav-active-bg: var(--ow-brand-halo), #E4EFF6;
  --sidebar-nav-active-color: #0E7490;  --sidebar-nav-active-border: rgba(22,140,255,.28);
  --sidebar-nav-active-shadow: none;

  --stat-card-bg: #FFFFFF;  --stat-card-border: #D3E3EE;
  --stat-card-shadow: 0 2px 8px rgba(10,31,46,.08);
  --stat-label-color: #4A6B7E;  --stat-value-color: #0A1F2E;  --stat-sub-color: #6B8798;

  --accent: #168CFF;  --accent-hover: #0F6FD0;  --accent-soft: rgba(22,140,255,.12);
  --purple: #5B7CF0;  --green: #0E9F83;  --orange: #D97706;  --pink: #DB2777;  --cyan: #0E9F83;
  --success: #0E9F83;  --warning: #D97706;  --danger: #DC2626;  --info: #168CFF;

  --text-primary: #0A1F2E;  --text-secondary: #4A6B7E;
  --text-muted: #6B8798;  --text-disabled: #93A9B7;
  --toggle-bg: #D3E3EE;  --thumb-shadow: 0 1px 3px rgba(10,31,46,.16);
  color-scheme: light;
}
```

---

## 4. 签名背景（第 3 节，整套外观的「指纹」）

三件套：**深空纯色底 + 右上品牌光晕 + 80px 极淡网格**。层次靠明度差，不靠模糊。

```css
/* 深色：画在 body 上 */
[data-theme="dark"] body {
  background-color: #071723;
  background-image:
    radial-gradient(560px 520px at calc(100% - 80px) -100px,
                    rgba(22, 140, 255, .25), rgba(22, 140, 255, 0) 70%),
    repeating-linear-gradient(0deg,  rgba(124, 185, 213, .16) 0 1px, transparent 1px 80px),
    repeating-linear-gradient(90deg, rgba(124, 185, 213, .16) 0 1px, transparent 1px 80px);
  background-attachment: fixed;
}

/* 浅色：同样内容画两份 */
[data-theme="light"] body { background-color: #F2F7FB; /* 同上，光晕 .12、网格 rgba(122,160,184,.12) */ }
html[data-theme="light"] { /* ← 必须！themes.css:252 用 !important 清掉了 body 背景，浅色只能画在 html 上 */ }
```

> 浅色为什么要画在 `html` 上：上游 `themes.css` 对 `body` 用了 `!important` 清背景，
> 所以浅色画布必须放 `html`，并且要排在上游 CSS 之后加载。

首帧（Vue 挂载前）由 `webui/index.html` 的 `#boot-critical` 内联样式用**同一组色值**
画在 `html[data-theme]` 上，避免启动闪白/闪紫。改主题色时这三处必须一起改：
`onewifi-theme.css` §3、`webui/index.html` boot-critical、`webui/src/stores/theme.js`
的 `THEME_COLORS`、`webui/public/manifest.webmanifest`。

---

## 5. 覆写架构（接入前必读，这是全套方案的核心）

### 5.1 上游是什么

`webui/src/main.js` 依次引入 24 层上游 CSS（style.css / themes.css /
glass-frame-dark.css / polish.css / cinematic-cards.css / semantic-card.css /
card-typography.css / card-micro-motion.css / control-sidebar.css / icon-system.css /
deep-control-panel.css / cinematic-glass-light.css / realtime-control-plane.css /
status-hero-cosmic.css / soft-label-card.css / dashboard-cinematic.css /
sidebar-dark.css / onewifi-lab.css / onewifi-lab-light.css / onewifi-chip.css /
overview-panels.css / dark-clickables.css / form-select.css / mobile.css /
liquid-glass.css / onewifi-pages.css），外加 `Login.vue` / `ChangePassword.vue`
按需引入的 `login.css`。

**这 24 层的外观绝大多数不是硬编码，而是集中在若干 CSS 变量家族里**（见 5.3 表）。

### 5.2 三条覆写铁律

1. **只改变量，不写选择器战争。** 上游把 `background / color / border / box-shadow`
   全写成 `var(--family-*)`，主题只需在**同名同作用域**的位置给变量赋新值。
2. **靠 cascade 顺序取胜，不用 `!important`。** 主题文件必须是最后一个 CSS import，
   与上游声明同权重时后加载者胜。
3. **只有上游硬编码的几何/颜色才写组件规则**（第 6 节），因此组件规则数量远小于上游。

### 5.3 上游变量家族速查表（改第二套主题就看这张表）

| 家族 | 控制什么 | 定义在 |
|---|---|---|
| `--gf-*` | 玻璃框体几何与投影 | glass-frame-dark.css |
| `--glass-*` / `--frame-*` / `--corner-glow-*` / `--lens-wash` | 面板底纹与内描光 | themes.css / polish.css / onewifi-lab.css |
| `--vh-*` | OneWifi 实验室面板 | onewifi-lab.css / onewifi-ref.css / onewifi-pages.css |
| `--dk-*` | 可点击 pill 按钮族（约 25 个按钮类共用） | dark-clickables.css |
| `--cp-*` | 控制面侧栏 | control-sidebar.css |
| `--lg-*` / `--mat-*` / `--cg-*` / `--ob-*` / `--se-*` / `--ccs-*` | 液态玻璃 / 材质 / 电影感 | liquid-glass.css / cinematic-glass-light.css |
| `--dash-*` / `--dcp-*` | 仪表盘与深控面板 | dashboard-cinematic.css / deep-control-panel.css |
| `--ob-icon-*` | 图标容器 | icon-system.css |

### 5.4 两个必须按原作用域覆写的坑

```css
/* ① --vh-* 定义在 (0,2,0) 的页面作用域上，全局 [data-theme] (0,1,0) 压不过 */
[data-theme="dark"] .onewifi-lab-shell,
[data-theme="dark"] .onewifi-console,
[data-theme="dark"] .ow-page,
[data-theme="dark"] .dashboard,
[data-theme="dark"] .dashboard-shell {
  --vh-surface: #0D293D; --vh-surface-hover: #14344A; --vh-surface-inset: #102E42;
  --vh-radius: 18px; --vh-card-shadow: var(--ow-shadow);
  --vh-top-light: none;
  --vh-edge-top: transparent; --vh-edge-side: transparent; --vh-edge-bottom: transparent;
  --vh-mint: #20D9AE; --vh-mint-neon: #B8F8EC;
}

/* ② --frame-* 在 .glass-frame--tone-green / .is-glow-green 上被再次定义（「已选中」高亮卡），
      要压住也得按原作用域再写一遍 */
```

### 5.5 反权重技巧：重复类名抬权

上游 `.glass-frame { background: ... }` 是硬编码时，用「重复类名」把特异性
从 (0,1,0) 抬到 (0,2,0)…（实际写作 `.glass-frame.glass-frame` 抬到 (0,2,0)，
配合更多类名可到 (0,3,0)），**仍然不需要 `!important`**：

```css
[data-theme="dark"] .glass-frame.glass-frame,
[data-theme="dark"] .onewifi-lab-shell .glass-frame.glass-frame,
[data-theme="dark"] .ow-page .glass-frame.glass-frame,
[data-theme="dark"] .dashboard .glass-frame.glass-frame,
[data-theme="dark"] .dashboard-shell .glass-frame.glass-frame {
  background: #0D293D;
  border: 1px solid #25516A;
  border-radius: 18px;
  box-shadow: var(--ow-shadow);
  backdrop-filter: none !important;      /* ← 只有这里用 !important：上游自己写了 !important */
  -webkit-backdrop-filter: none !important;
}
```

### 5.6 按钮整族换肤：改变量而不是改选择器

`dark-clickables.css` 对约 25 个按钮类都写了 `background: var(--dk-click-bg) !important`。
所以**只需在主按钮作用域改 `--dk-click-*`，连它自带的 `!important` 都会拿到渐变**：

```css
[data-theme="dark"] :is(.btn-primary, .stream-btn--primary, .sms-compose__send, .ow-ver-card__primary) {
  --dk-click-bg: linear-gradient(135deg, #168CFF 0%, #20D9AE 100%);
  --dk-click-bg-top: linear-gradient(135deg, #168CFF 0%, #20D9AE 100%);
  --dk-click-bg-bottom: linear-gradient(135deg, #168CFF 0%, #20D9AE 100%);
  --dk-click-color: #071723;            /* 渐变上必须用深色文字 */
  --dk-click-border: transparent;
  --dk-click-shadow: 0 8px 20px rgba(22, 140, 255, .26);
}
/* hover 用更亮一支：#3AA0FF → #35D9B8，文字 #04121C，投影 .32 */
```

> 不透明背景下 `backdrop-filter: blur()` 不可见，因此按钮上硬编码的 blur 可安全忽略。

---

## 6. 主题文件结构（`onewifi-theme.css` 7 节）

| 节 | 内容 | 行数约 |
|---|---|---|
| §0 | OneWIFI 自有令牌 `--ow-*` | 25–57 |
| §1 | 深色一级令牌（表面/玻璃退化/侧栏/统计卡/语义色/圆角） | 60–168 |
| §2 | 浅色一级令牌（结构不变只换表面） | 170–267 |
| §3 | 签名背景（深空底 + 光晕 + 网格） | 269–289 |
| §4 | 二级令牌覆写（8 个上游变量家族） | 291–764 |
| §5 | 玻璃拟态拆除（框体实心化 / 伪元素 / 颗粒 / 侧栏 / 浅色容器） | 765–955 |
| §6 | 组件级规则（按钮/表单/导航/卡片/徽标/进度/对话框/登录页/列表行/开关） | 956–1565 |
| §7 | 细节收口（滚动条/焦点环/选区/动效/系统偏好） | 1566–1692 |

### 6.1 组件级规则清单（§6）

| 编号 | 组件 | 做法 |
|---|---|---|
| 6.1 | 渐变主按钮 | 改 `--dk-click-*` 变量（见 5.6），选择器 `:is(.btn-primary, .stream-btn--primary, .sms-compose__send, .ow-ver-card__primary)` |
| 6.2 | 幽灵按钮 | 透明底 + 1px `#25516A` 边 + 冰白文字；hover 底 `#14344A` 边 `#2F6B8A` |
| 6.3 | 表单控件 | 圆角 16px、底 `#102E42`、边 `#25516A`、占位 `#8EACBE` |
| 6.4 | 导航 | 激活项薄荷字 + 品牌 halo 底 + 1px 薄荷边 |
| 6.5 | 统计卡 | 实心 `#0D293D` + `--ow-shadow`，hover 抬升 -2px |
| 6.6 | 徽标 | 品牌 halo 底 + 薄荷点 |
| 6.7 | 进度条 | 渐变填充 |
| 6.8 | 对话框 | 圆角 28px，实心面板 |
| 6.9 | 登录页 | **整段重绘**：深海背景 + 四层波浪重着色 + 30px 实心卡 + 薄荷 O 环 + 方角输入框 + 48px 高渐变胶囊按钮 |
| 6.10 | 列表行 | `:is(.policy-compact__row, .esim-row, .ow-log-row, .carrier-banner)`——**只收这 4 个**，`.ow-row` / `.metric-row` 是 label 行、`.device-card__plate` 自带 glass-frame，排除 |
| 6.11 | 开关与主题胶囊 | 轨道 `#25516A`，开启渐变滑块 |

登录页关键片段（可直接抄）：

```css
[data-theme="dark"] .auth-bg {
  background:
    radial-gradient(760px 640px at calc(100% - 60px) -140px, rgba(22,140,255,.26), rgba(22,140,255,0) 68%),
    radial-gradient(520px 420px at 6% 108%, rgba(32,217,174,.12), rgba(32,217,174,0) 70%),
    linear-gradient(180deg, #0B2334 0%, #071723 44%, #040F19 100%);
}
[data-theme="dark"] .auth-card { background: #0C2434; border: 2px solid #25516A; border-radius: 30px; }
[data-theme="dark"] .auth-go {
  width: auto; min-width: 132px; height: 48px; padding: 0 26px; border: none;
  border-radius: 23px; background: var(--ow-brand-gradient);
  box-shadow: 0 8px 20px rgba(22,140,255,.26); color: #071723;
}
[data-theme="dark"] .brand-mark.brand-mark { --mark-plate: #0D293D; --mark-plate-border: #25516A; --mark-ring: #20D9AE; }
```

### 6.2 §5 玻璃拆除清单

1. 深色框体实心化（`.glass-frame.glass-frame` 抬权，见 5.5）
2. 伪元素眩光 `::before/::after` 清空
3. 变体圆角统一
4. 浅色同构实心化
5. 通用容器（`.ow-glass` / `.panel-card` 等）
6. 电影颗粒：`:root { --cine-grain-opacity: 0; --ob-noise-image: none; }` +
   `body::before { opacity: 0 }` + `#app::after { display: none }`
7. 侧栏内描光 → 1px `#25516A` 边
8. 浅色主容器上游用 `!important` 写半透明玻璃，主题只能用 `!important` 压回实心
9. 浅色画布画在 `html` 上（见 §4）

### 6.3 §7 细节收口

品牌焦点环 `:focus-visible { outline: 2px solid rgba(22,140,255,.75); outline-offset: 2px }`、
`::selection` 深色薄荷 `rgba(32,217,174,.28)` / 浅色蓝 `rgba(22,140,255,.20)`、动效统一缓动 `cubic-bezier(.22,1,.36,1)`、
hover 抬升 `translateY(-2px)`、`prefers-reduced-motion` 全关过渡、
`prefers-reduced-transparency` 强制实心底。

---

## 7. 接入步骤（3 步）

```bash
# ① 拷文件（真源在仓库根目录）
cp onewifi-theme.css webui/src/assets/onewifi-theme.css

# ② main.js：在最后一个 CSS import 之后加一行
#    import './assets/onewifi-pages.css'
#    import './assets/onewifi-theme.css'   ← 必须是最后一个

# ③ 首帧三件套同步（见 §4）：webui/index.html 的 boot-critical、
#    webui/src/stores/theme.js 的 THEME_COLORS、webui/public/manifest.webmanifest
```

主题切换沿用现有机制（`stores/theme.js`：dark / light / auto），
主题文件本身同时提供两套 OneWIFI 表面色，无需改 JS。

---

## 8. 怎么做出「第二套主题」（本文档的重点）

### 8.1 可移植层 / 需替换层

| 层 | 是否可移植到其他 Vue 项目 | 说明 |
|---|---|---|
| §0 `--ow-*` 令牌 | ✅ 完全可移植 | 与业务无关的纯设计令牌 |
| §3 签名背景 | ✅ 完全可移植 | 三条 gradient，与 class 名无关 |
| §6 组件级规则 | ⚠️ 半移植 | 依赖本仓库 class 名（`.btn-primary` / `.ow-field` / `.auth-*` …），换项目需按新项目的 class 名重映射 |
| §7 细节收口 | ✅ 基本可移植 | 焦点环/选区/动效与 class 名无关 |
| §1/§2 一级令牌 | ⚠️ 需查目标项目的令牌名 | 若目标项目也用 `--bg-base` 等同名令牌可直接用，否则按目标项目令牌表重映射 |
| §4/§5 二级覆写 | ❌ 本项目专用 | 依赖本仓库 24 层上游 CSS 的变量家族与作用域，换项目必须重新测绘 |

### 8.2 推荐做法：令牌层 + 覆盖层分离

```
webui/src/assets/
  onwifi-theme-base.css      ← §0 + §3 + §6 + §7（与具体配色无关的「形态层」）
  onwifi-<name>-theme.css    ← 只写 §1/§2/§4/§5 的令牌值（「配色层」），最后引入
```

第二套主题只需新建一个 `onwifi-<name>-theme.css`，复制第一套的令牌结构、换掉
下面的「最小改令牌集」，**架构、组件规则、背景三件套全部复用**。

### 8.3 最小改令牌集（改这 16 个值 = 换一整套外观）

```css
:root {
  --ow-brand-from / --ow-brand-to        /* 品牌渐变两端：决定整套色调 */
  --ow-mint                              /* 高亮色：字标 / 激活态 / 焦点环 */
  --ow-bg-void    --ow-bg-sidebar        /* 页面最底 / 侧栏底 */
  --ow-panel      --ow-panel-deep        /* 卡片 / 沉一级表面 */
  --ow-inset                            /* 输入框 */
  --ow-border     --ow-border-strong     /* 边 / hover 边 */
  --ow-text-1 … --ow-text-4              /* 四级文字 */
  --ow-grid-line                         /* 背景网格线 */
  --ow-shadow / --ow-shadow-soft         /* 投影基色（改表面明度时要跟着改） */
}
```

改完必须同步的三处：主题文件 §3 背景、`webui/index.html` boot-critical、
`stores/theme.js` 的 `THEME_COLORS` + `manifest.webmanifest`。

### 8.4 负面约束（第二套主题也要遵守）

1. **品牌渐变只允许大面积出现在主按钮 / 登录按钮 / Hero 字标**，禁止铺满卡片、边框、整页背景。
2. **渐变上的文字必须用深色**（`#071723` 一类），禁止白字。
3. **不用 `backdrop-filter` 模糊**：OneWIFI 的层次靠表面明度差（void → sidebar → panel → deep → inset 五档）。
4. **禁止紫色系做主色**（第一套 themes.css 的紫色玻璃是要被替换掉的对象）。
5. **投影要大而柔**（`0 16px 22px` 一级），不要小而硬。
6. 圆角三档固定：卡片 20px / 面板 28px / 胶囊 23px；对话框 28px；输入框 16px。
7. 技术标识不改：`MDD_*` 环境变量、`io.mdd-sim-gateway.*` Docker label、`mdd-sim-gateway-*`
   服务名、`X-MDD-CSRF-Token` 请求头、`onebord-embed` 类名、`oneboard-session-bearer` 等存储键。

---

## 9. 验证方法（三关，缺一不可）

### 9.1 语法自检

```bash
python - <<'PY'
s = open('onewifi-theme.css', encoding='utf-8').read()
print('braces', s.count('{'), s.count('}'))
print('parens', s.count('('), s.count(')'))
import re
defined = set(re.findall(r'(--[\w-]+)\s*:', s))
used = set(re.findall(r'var\((--[\w-]+)', s))
print('undefined vars:', sorted(used - defined))
PY
```

### 9.2 构建产物体外验证（确认主题排在上游之后）

```bash
cd webui && npm run build
python - <<'PY'
import glob, re
s = open(glob.glob('dist/assets/index-*.css')[0], encoding='utf-8').read()
for pat in (r'--vh-surface:', r'--ow-brand-from:'):
    print(pat, [m.start() for m in re.finditer(pat, s)][:6])
# 期望：--vh-surface 上游定义(小偏移) < 主题覆写(大偏移)
PY
```

### 9.3 渲染验证（headless Chrome）

```bash
# 预览页（双主题各截一张）
"C:/Program Files/Google/Chrome/Application/chrome.exe" --headless --disable-gpu --no-sandbox \
  --force-device-scale-factor=1 --window-size=1440,3200 \
  --screenshot="$TEMP/preview-dark.png" --virtual-time-budget=9000 --hide-scrollbars \
  "file:///E:/GQ/Ultra/mdd-sim-gateway/onewifi-theme-preview.html"

# 真实构建（需先 cd webui && npx vite preview --port 4177）
... "http://127.0.0.1:4177/login"
```

> 已知坑（都踩过）：
> ① 截图输出路径必须用 Windows 原生路径（`C:/Users/.../Temp/`），Git Bash 的 `/e/...` 会丢文件；
> ② 预览页必须引入 `login.css`（Login.vue 按需引入，全局 CSS 里没有），否则登录块塌成空块；
> ③ 预览页必须复刻 CatLogo.vue 的 scoped 尺寸（`.brand-mark` 36/52px），否则品牌 O 环 SVG 塌成 0；
> ④ `vite preview` 要用 `run_in_background` 起，否则 shell 退出会带走进程；
> ⑤ 登录页与组件区在浅色下「看起来空」是正常——浅色卡片与页面底色接近，放大看即可。

---

## 10. 已知遗留（不在本次范围）

- `assets/product-tour*.gif`、`screenshots/*.png` 是旧品牌录屏/截图，文本替换改不了，需重录。
- `docs/onewifi-migration/` 下的 OneBoard 字样是历史审计记录，按「历史记录不改名」约定保留。
- Windows 本地无 pytest，`.venv-linux` 是 Linux venv 不可执行，测试只能在 Linux/CI 跑。

---

## 11. 给 Grok 的任务指令（可直接粘贴）

```
目标：为 OneWIFI WebUI 做第二套主题。

输入：
1. 读 docs/design/onewifi-theme-handoff.md（本文档）——架构、令牌、覆写策略、验证方法都在里面
2. 读 onewifi-theme.css（第一套主题，唯一真源，根目录）
3. 读 docs/design/onewifi-ui-design-language.md（设计规范原文）

要求：
- 按 §8.2 的「形态层 + 配色层」结构新建 webui/src/assets/onwifi-theme-base.css
  （= 第一套的 §0 + §3 + §6 + §7，与配色无关）和 onwifi-<新主题名>-theme.css（只放配色令牌）
- 两文件都必须在 main.js 最后一个 CSS import 之后引入，base 在前、配色层在后
- 遵守 §8.4 全部负面约束
- 改完执行 §9 三关验证，把三项输出贴回来
- 仓库是 CRLF 行尾；改完根目录真源必须同步 webui/src/assets/ 副本
```
