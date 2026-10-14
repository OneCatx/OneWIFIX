# OneBoard Android UI 设计规范

> **原则**：**网页端喜爱点优先保留**；配色家族对齐 OneIMS；材质做「等价翻译」而不是推倒重来。  
> **状态**：v1.1 对齐策略修订 · 2026-07-13  
> **证据源**：`onebord/src/**` CSS 主题 · `OneIMS/.../ui/theme/Theme.kt` · `sidebarNav.js`

---

## 0. 一致化口号（给实现的人看）

**「Web 的魂，OneIMS 的皮。」**

- **魂** = 你喜欢的网页端：模块结构、卡片编排、Hero 气场、玻璃层次感、控制台节奏  
- **皮** = OneIMS：主色 / 表面色 / 品牌红 / 主题三态 / 触控尺度  
- **翻译** = 安卓上用半透明 Surface + 细描边高光模拟玻璃，**不**硬上 40px backdrop blur

---

## 1. 设计目标

| 维度 | 跟谁对齐 | 说明 |
|------|----------|------|
| 导航模块与路由语义 | OneBoard Web | 监控 / 控制 / 系统 原样 |
| 页面信息层级 | OneBoard Web | Hero → 色板卡 → 分组列表，密度与节奏跟 Web |
| 卡片「玻璃感」气场 | OneBoard Web（翻译实现） | 保留分层、描边高光、悬浮 dock 感 |
| 配色 / 语义色 / 主题 | OneIMS Material 3 | 换色不换骨架 |
| 触控热区 / Dock 容器 | OneIMS | 手机底栏可用性优先 |
| 强 blur / 霓虹 mint / 宇宙 mesh | **弱化或替换** | 性能 + 品牌一致性，用等价视觉代替 |

**一句话**：打开 App 要觉得「这就是 OneBoard」，颜色则像 OneIMS 一家人。

---

## 1.5 必留 / 可改 / 必换（喜爱点对齐清单）

### ✅ 必留（Web 灵魂，尽量原味）

| 喜爱点 | 安卓怎么对齐 |
|--------|----------------|
| 三模块信息架构 | Dock/Rail 仍按 监控｜控制｜系统 |
| 控制台页结构（仪表盘 Hero、节点卡、规则列表…） | 同页同区块顺序，不重排成「陌生设置页」 |
| 大圆角壳层 / 卡片（20–32） | 直接用 20 / 28 / 32 dp |
| 侧栏「悬浮岛」气质 | 手机 → 底悬浮 Dock；平板 → 左 Rail 玻璃感容器 |
| 状态胶囊 / 运行指示 | Pill 形态保留，色改 OneIMS primary/error |
| 深浅双主题切换入口 | 设置里三态 + 动态色，交互位置对齐 Web 习惯 |
| 分区着色卡片（蓝/紫/绿玻璃卡语义） | **保留分区语义**，底色改成 primaryContainer / tertiaryContainer / secondaryContainer |

### 🔁 可改（等价翻译，不丢感觉）

| Web 做法 | 安卓等价 |
|----------|----------|
| `backdrop-filter: blur(18–40px)` | `surfaceContainerHigh` + alpha 0.88–0.94 + 1dp 亮边描边（模拟玻璃边） |
| 多色 mesh 页面底 | OneIMS `background`；可选极淡 primary 径向（≤6% alpha，可关） |
| 侧栏 mint 激活 | `primary` 激活（色换，形状/动效保留） |
| Bebas Neue 大数字 | SansSerif SemiBold / 系统展示字重，字号层级跟 Web Hero |
| 内容字号偏桌面（12.5px） | 升到可读触控级，但层级比例跟 Web |

### ⛔ 必换（跟 OneIMS 家族色走）

| 项 | 从 Web | 换成 OneIMS |
|----|--------|-------------|
| 主色 accent | `#8ab4f8` / `#4F8CFF` | `#0B57D0` / `#A9C7FF`（可动态色） |
| 页面底 | `#070812` 宇宙紫黑 / `#e8edff` mesh | `#111318` / `#F9F9FF` |
| 危险/成功 | Web 独立绿系成功色 | 成功→primaryContainer；危险→error |
| 品牌启动识别 | （Web 弱） | `#D6242F` 闪屏与 Mark |
| 主 CTA | accent 蓝实心 | 白底黑字药丸（OneIMS） |

---

## 2. 冲突裁决（必须先定）

| 冲突点 | Web OneBoard | OneIMS | **Android 定稿** |
|--------|--------------|--------|------------------|
| 主色 | 深 `#8ab4f8` / 浅 `#4F8CFF` | `#0B57D0` / 动态色 `#A9C7FF` | **用 OneIMS primary**（默认可开 Material You） |
| 品牌识别 | 无独立红标 | `#D6242F` 闪屏/图标/Rail | **保留品牌红**作启动与 Mark，不进 primary |
| 激活导航色 | mint `#86efac` / teal `#0f766e` | `primary` 选中 | **色换 primary，形状/指示条跟 Web** |
| 背景 | 紫黑宇宙 / 浅蓝 mesh | `#F9F9FF` / `#111318` | **OneIMS 底色**；允许极淡氛围光（可关） |
| 卡片材质 | 强 blur 玻璃 | 扁平 Surface | **「玻璃魂」**：半透明 Surface + 亮边 + 分层阴影，不做重 blur |
| 成功色 | `#81c995` / `#059669` | primaryContainer | **跟 OneIMS** |
| 手机导航 | ≤900px 侧栏改顶部块 | 底悬浮 Dock + ≥720dp Rail | **底 Dock（三主模块）+ 更多抽屉**；视觉贴近 Web dock |
| 主 CTA | accent 蓝按钮 | 白底黑字药丸 | **跟 OneIMS PrimaryButton** |

---

## 3. 信息架构（保持 Web 一致）

### 3.1 模块（来自 `sidebarNav.js`）

| 模块 ID | 标签 | 页面 |
|---------|------|------|
| `monitor` | 监控 | 仪表盘、设备、短信中心、DNS 监控 |
| `control` | 控制 | WIFICALL、规则、订阅、Proxy |
| `system` | 系统 | 设置、日志 |
| 辅助 | — | 帮助/关于、退出登录 |

### 3.2 手机导航映射

```
底部悬浮 Dock（对齐 OneIMS DockIsland）
├─ 监控  → 默认进仪表盘；同模块页用顶栏 Tab / 分段切换
├─ 控制  → 默认进 WIFICALL（core 模块）
├─ 系统  → 默认进设置
└─ 「更多」抽屉：帮助、主题、退出、跨模块快捷入口

大屏 ≥720dp：左侧 NavigationRail + 品牌红 Mark（对齐 OneIMS）
```

### 3.3 页面骨架（每页统一）

```
Scaffold(background)
  ├─ TopAppBar（标题 = Web 页名；可选副标题主机/状态）
  ├─ StatusHero（可选，对齐 Web status-hero / OneIMS StatusHero）
  ├─ 分组卡 SettingsGroup 式（surfaceContainerLow，圆角 20dp）
  │    └─ 行项目 72dp 最小高度
  └─ 底 Dock（主壳级，非每页重复）
```

---

## 4. 色板 Token（OneIMS 真源）

### 4.1 品牌层

| Token | 值 | 用途 |
|-------|-----|------|
| `brandRed` | `#D6242F` | Splash、Launcher、Rail Logo |
| CTA fill/text | `#FFFFFF` / `#000000` | 主确认按钮（不跟 primary） |

### 4.2 交互层 — 浅色静态回退

| Token | HEX | 映射自 Web |
|-------|-----|------------|
| primary | `#0B57D0` | ← 替换 `--accent` |
| primaryContainer | `#D7E3FF` | ← 替换 glass-blue / 成功底 |
| background / surface | `#F9F9FF` | ← 替换 `--bg-base` / mesh |
| onSurface | `#1A1B20` | ← `--text-primary` |
| onSurfaceVariant | `#44474F` | ← `--text-secondary/muted` |
| secondaryContainer | `#DBE2F9` | ← 非危险提示底 |
| error | `#BA1A1A` | ← `--danger` |
| errorContainer | `#FFDAD6` | ← 危险/未就绪 Hero |

### 4.3 交互层 — 深色静态回退

| Token | HEX |
|-------|-----|
| primary | `#A9C7FF` |
| primaryContainer | `#00468B` |
| background / surface | `#111318` |
| onSurface | `#E2E2E9` |
| onSurfaceVariant | `#C4C6D0` |
| error | `#FFB4AB` |
| errorContainer | `#93000A` |

### 4.4 主题模式（两边都有，统一到 OneIMS 语义）

| 模式 | 行为 |
|------|------|
| SYSTEM | 跟随系统（默认） |
| LIGHT / DARK | 强制 |
| dynamicColor | 默认 **true**（Material You）；关闭则用上表静态板 |

---

## 5. 形状与间距（融合）

| Token | 定稿 | 来源 |
|-------|------|------|
| cardCorner | **20dp** | OneIMS `OneImsTokens` ≈ Web `--radius-card` |
| hero / dialog | **32dp** | OneIMS extraLarge ≈ Web shell 28–32 |
| dock island | **28dp** | OneIMS |
| 行高 | **≥72dp** | OneIMS（触控友好，优于 Web 12.5px 字号密度） |
| 水平边距 | **20dp** | OneIMS；Web gutter 28 在手机上改为 16–20 |
| 分组间距 | **12dp** | OneIMS itemSpacing |

**禁止（性能/一致性硬伤）**：Android 上大规模实时 `backdrop-filter`、满屏多色 mesh、未配对对比度的半透明白字。

**必须保留的「Web 感觉」**：分层卡片、亮边描边、悬浮 Dock、Hero 气场、分区语义色卡。

**允许的氛围翻译**：Dock/卡片 `surfaceContainerHigh` + alpha 0.88–0.94 + 1dp 亮边；选中态用 primary 指示条（形状跟 Web，色跟 OneIMS）。

---

## 6. 组件对照表（实现清单）

| Web 组件/模式 | Android 目标组件 | 色/形约束 |
|---------------|------------------|-----------|
| Sidebar dock | 底 Dock + 大屏 Rail | 选中 = primary |
| ThemeToggle | Settings 主题三态 + 动态色开关 | 同 OneIMS Settings |
| glass / glass-frame 卡 | `SettingsGroup` / Surface 卡 | surfaceContainerLow，无 blur |
| status-pill | FilterChip / 小 Pill | ready→primaryContainer；fail→error |
| Status Hero | `StatusHero` | 同 OneIMS |
| 主按钮 `.btn` accent | `OneImsPrimaryButton` | 白底黑字 |
| Toast | Snackbar | onSurface 语义 |
| 登录页 | 独立全屏 + brandRed 顶部条可选 | 表单用 M3 OutlinedTextField |

---

## 7. 关键页面 UI 草图（文字线框）

### 7.1 仪表盘（监控 · 默认）

```
┌─────────────────────────────┐
│ 仪表盘            主机 · ●  │
├─────────────────────────────┤
│ ┌ StatusHero ─────────────┐ │
│ │ 运行中 / 流量摘要        │ │
│ └─────────────────────────┘ │
│ ┌ 流量 / 节点 分组卡 ─────┐ │
│ │ 行 · 行 · 行             │ │
│ └─────────────────────────┘ │
│ ┌ 快捷入口 ───────────────┐ │
│ │ DNS · 设备 · 短信 …      │ │
│ └─────────────────────────┘ │
├─────────────────────────────┤
│   ( 监控 )  控制   系统     │  ← 悬浮 Dock
└─────────────────────────────┘
```

### 7.2 控制 · WIFICALL

结构同 Web Nodes：Hero（连接态）+ 节点列表卡 + 主 CTA「应用/切换」。

### 7.3 系统 · 设置

完全复用 OneIMS Settings 分组视觉；外观项含主题模式 + 动态色。

---

## 8. 无障碍与触控

- 对比度：遵循 M3 on* 配对，不自造半透明白字压玻璃底  
- 触控热区 ≥ 48dp；列表行 ≥ 72dp  
- `prefers-reduced-motion`：无装饰性无限动画  
- 动态色关闭路径必须可用（静态板已定义）  
- 错误态必须有文案 + error 色，不只靠颜色  

---

## 9. 实现落地建议（下一拍）

1. **优先**：在 Android 工程建立 `OneBoardTheme`，直接复用 / 抽离 OneIMS `Theme.kt` + `OneImsTokens` + BrandRed  
2. **壳层**：MainScaffold = TopBar + NavHost + Dock（三模块）  
3. **首屏**：登录 + 仪表盘 + 设置（验证色板与导航）  
4. **再迁**：控制模块页、设备、日志  

工程落点二选一（需哥哥拍板）：
- A. 新建 `OneBoard` Android 模块，依赖共享 UI 主题  
- B. 在现有 `OneIMS` 内增加 OneBoard 功能入口（共享 Theme 成本最低）

---

## 10. 验收标准（UI）

- [ ] **一眼 OneBoard**：模块与关键页区块顺序与 Web 一致，不是「换皮陌生 App」  
- [ ] **色是 OneIMS**：主色/表面/错误来自 scheme；品牌红仅启动/Mark  
- [ ] **玻璃魂仍在**：卡片有分层 + 亮边 + 悬浮感（允许无重 blur）  
- [ ] 深/浅/系统三态无色漂  
- [ ] 手机 Dock 可用；≥720dp 切 Rail  
- [ ] 主 CTA 为白底黑字药丸  
- [ ] 分区色卡语义保留（蓝/紫/绿区 → M3 container 色）  

---

*文档归属：OneBoard 移动端设计。配色真源以 OneIMS `Theme.kt` 为准；IA 与喜爱布局真源以 Web OneBoard 为准。v1.1 强调：一致化 ≠ 砍掉 Web 审美。*
