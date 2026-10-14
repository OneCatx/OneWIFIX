# 用 OneWIFI Vue OneBoard 替换 React 管理面

日期：2026-10-14

## 决定

用 `E:\GQ\Ultra\NEWWIFI\vendor\onewifi-web\frontend` 整套替换 `webui/`。原来的 React 页面不再作为管理面。后端仍是当前网关，不新增第二套控制面。`NEWONE` 与 `NEWWIFI` 只读，只从后者复制前端。

## 源与入口

- 源：Vue 3 + Vue Router + Vite 的 OneBoard。页面有仪表盘、设备、短信、通话、代理、保号、日志、设置、通知。
- 网关继续从 `webui/dist` 提供页面。`/{path}` 已经回落到 `index.html`，Vue 的 history 路由可以沿用。
- 开发预览仍用 Vite。`VITE_API_BASE` 为空时请求打到同源；有网关时把 `/api` 和 `/ws` 代理过去。

## 接口

- 业务请求继续走源里的 `onewifiGateway.*` 与 `onewifi.adapter.*`，目标是当前网关已有的 `/api`。
- 登录必须改成网关浏览器会话：`GET /api/auth/status`、`POST /api/auth/setup`、`POST /api/auth/login`、`POST /api/auth/logout`，Cookie 加 `X-OneWIFI-CSRF-Token`。不再调用源里的 `/api/auth/session`，也不为网页再发一套 bearer。
- 没有网关时只显示登录页或明确的连接失败，不使用预览账号假装已登录。

## 不做

- 不改手机端、不部署 FNOS、不改发行镜像构建。
- 不把群晖驱动包或 Go 控制面迁进来。
- 源目录里的 `server/` 不作为网关进程运行。

## 验收

- `webui` 能 `npm run build`，产物由现有静态路由提供。
- 源里带过来的 `node --test` 仍通过；其中依赖旧 `/api/auth/session` 的断言改成网关登录契约。
- 本地 `vite` 打开后能看到 OneBoard 登录页。未连接网关时不能进入仪表盘。
