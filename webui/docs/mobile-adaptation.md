# OneBoard 移动端适配与 iOS / Android 系统特性

> 版本：v1.1 · 2026-07 · 本文档与代码事实一一对应，改动时请同步更新。

## 一、能力总览

| 能力 | iOS (Safari/标准 WebView) | Android (Chrome/WebView) | 实现位置 |
|---|---|---|---|
| 添加到主屏幕（独立窗口运行） | `apple-mobile-web-app-capable` | W3C `manifest.webmanifest` | `index.html` / `public/manifest.webmanifest` |
| 桌面图标 | `apple-touch-icon.png` 180×180 | manifest icons 192/512（含 maskable 自适应） | `public/` / `public/icons/` |
| 状态栏 / 系统栏着色 | `black-translucent` 沉浸式状态栏 | `theme-color`（明暗双值 + 运行时联动） | `index.html` / `src/stores/theme.js` |
| 刘海 / 灵动岛 / Home 指示条避让 | `viewport-fit=cover` + `env(safe-area-inset-*)` | 同左（打孔屏/手势条） | `index.html` / `src/assets/mobile.css` |
| 地址栏收展视口稳定 | `100dvh` 动态视口（`@supports` 渐进增强） | 同左 | `src/assets/mobile.css` |
| 防聚焦自动放大 | 移动端输入控件字号 ≥16px | 不受影响（顺带统一） | `src/assets/mobile.css` |
| 防误识别电话号码 | `format-detection: telephone=no`（ICCID/端口保护） | — | `index.html` |
| 触控体验 | 44px 热区 / 去点按高亮 / 惯性滚动 / 去 hover 残留 | 同左 + `touch-action: manipulation` | `src/assets/mobile.css` |

未引入 Service Worker：控制面板以实时数据为核心，离线缓存易造成状态陈旧，刻意不做。

## 二、移动端布局（≤900px）

- 导航采用 iOS 26 双层结构：**顶部身份坞**（头像 + 用户名/主机名 + 主题胶囊，吸顶）+ **底部 Liquid Glass 悬浮 Tab 栏**（页面切换）。桌面侧边栏 rail 在移动端隐藏，避免双重导航。
- 页面留白从 28px 收紧至 12px，并用 `max(12px, env(safe-area-inset-*))` 兜底异形屏。
- 首屏骨架（`index.html` boot-critical）同步移动端形态，避免首帧闪跳。
- 小屏（≤900px）隐藏仪表盘 Hero 装饰电路，首屏优先展示真实指标。
- 弹窗编辑器（规则/订阅/正则/YAML 导入）最大高度改用 `88dvh`，内衬避开安全区；Toast 在 ≤640px 变为顶部横幅。

## 二·五、iOS 26 悬浮 Tab 栏与 Liquid Glass（流体玻璃）

对照 Apple WWDC25 规范（`tabBarMinimizeBehavior(.onScrollDown)` 与 Liquid Glass 材质）的 Web 等价实现：

- **悬浮 Tab 栏**（`MobileTabBar.vue`）：固定悬浮于底部安全区上方，常驻 4 个高频页（仪表盘 / 设备 / 短信 / WIFICALL，配置于 `sidebarNav.js` 的 `MOBILE_TAB_PATHS`），其余页面进「更多」流体抽屉（3 列宫格 + 帮助/退出）。
- **滚动收缩**（`useLiquidTabBar.js`）：下滑越过 24px 阈值 → 栏体沉降缩小、标签隐去只留图标；上滑立即回弹；页面顶部/临近底部强制展开；软键盘弹出（visualViewport 高度骤降 >25%）整栏隐藏避让。
- **Liquid Glass 材质**（`liquid-glass.css` 的 `.lg-material`）：`backdrop-filter blur(24px) saturate(180%)` 折射环境色 + 顶缘镜面高光 + 边缘透镜 rim + spring 缓动（过冲回弹曲线），明暗双主题 token 化。
- **降级链**：不支持 `backdrop-filter` → 实底；`prefers-reduced-transparency` → 实底；`prefers-reduced-motion` → 去位移缩放只留透明度过渡；桌面端组件不渲染（`matchMedia` 守卫）+ CSS 双保险隐藏。
- **内容让位**：`--lg-tabbar-clearance` 统一管理底部让位高度，`mobile.css` 中 `.layout` padding-bottom 引用之。
- **键盘无障碍**：「更多」抽屉打开时焦点自动移入首个菜单项，`Esc` 关闭并把焦点归还「更多」触发按钮（`role="menu"`/`menuitem` + `aria-expanded` 语义齐备）。

## 三、关键文件

| 文件 | 职责 |
|---|---|
| `src/assets/mobile.css` | 移动端适配层（main.js 最后引入，靠 cascade 覆盖；6 个分区见文件头注释） |
| `src/assets/liquid-glass.css` | Liquid Glass 材质 tokens + 悬浮 Tab 栏/流体抽屉样式 + 全部降级链 |
| `src/components/MobileTabBar.vue` | 底部悬浮 Tab 栏组件（复用 `NAV_MODULES` 数据与 `MIcon` 体系，含无障碍语义） |
| `src/composables/useLiquidTabBar.js` | 滚动方向感知收缩 + 软键盘避让行为 |
| `public/manifest.webmanifest` | PWA 清单（standalone / 明暗主题色 / maskable 图标） |
| `scripts/generate-pwa-icons.mjs` | 零依赖 PNG 图标生成器（品牌环形 Logo，改图标后重跑：`node scripts/generate-pwa-icons.mjs`） |
| `src/stores/theme.js` | `applyTheme()` 同步 `meta[theme-color]`，切主题时系统栏颜色跟随 |
| `server/gateway.js` | 新增 `.webmanifest` → `application/manifest+json` MIME |
| `public/fonts/` | 自托管 Roboto（300-600）与 Bebas Neue 的 latin woff2 + `fonts.css`（替代 Google Fonts CDN，弱网/大陆环境首屏不再被字体请求挂起） |

## 四、验证记录

- `npm run build` 通过（vite 8，246 modules）；产物含 dvh×14、safe-area×8、sticky 导航坞、44px 热区规则。
- `npm run preview` 冒烟：`/manifest.webmanifest` 200 + 正确 MIME；`/apple-touch-icon.png`、`/icons/icon-maskable-512.png` 200。
- 真机建议自查清单：
  1. iPhone Safari「添加到主屏幕」→ 图标为黑底白环，启动无浏览器栏，状态栏沉浸；
  2. Android Chrome 菜单「安装应用」→ 自适应图标裁形正常（圆/方/水滴）；
  3. 明暗主题切换时状态栏颜色跟随；
  4. 竖屏浏览各页面无横向溢出，顶部导航坞可横滑并吸顶。
