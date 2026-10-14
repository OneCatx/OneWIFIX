# OneWIFI 前端

精简 OneBoard 前端（Vue 3 + Vite），作为 OneWIFI 的控制台 UI。产品入口与部署方式见上级 [`../README.md`](../README.md)：生产构建产物写入 `../web/dist`，由 Go 二进制内嵌，只开 `:6688`。

> 历史上 OneBoard 曾有独立的 `:8866` Node gateway / Docker 部署链，均不再是本栈目标，相关文件已移除（归档见仓库 `.xj-cursor/`）。

## 开发

```bash
npm install
npm run dev     # /api 代理到 127.0.0.1:6688，可用 VITE_API_PROXY 改
```

代理配置见 `.env.example`；dev 代理逻辑在 `server/onewifiDevProxy.js`（会为 http://localhost 剥掉 Cookie 的 Secure 标记）。

## 构建与测试

```bash
npm run build   # 产物写入 ../web/dist（VITE_OUT_DIR 可改）
npm test        # node --test：src/**/*.test.js + server/tests/*.test.mjs
```

## 目录

| 路径 | 内容 |
|---|---|
| `src/views` | 页面（dashboard / devices / proxy / sms / keepalive / logs / settings 等） |
| `src/components` | 组件 |
| `src/stores` | 自建 reactive 模块（无 Pinia） |
| `src/composables` | 组合式函数 |
| `src/assets` | 全局 CSS（`main.js` 按 cascade 顺序引入） |
| `server` | 仅 Vite dev 代理与其测试 |
| `scripts` | 手动工具（PWA 图标、国旗资源、移动端冒烟） |
