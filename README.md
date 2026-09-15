# vw_web_builds · `shypwd` 分支

<p align="center">
  <strong>Bitwarden Web Vault 的构建源 fork —— 为 Warden（跑在 Cloudflare Workers 上的
  Bitwarden 兼容密码库）提供移动端深度适配</strong>
</p>

<p align="center">
  <img alt="Upstream" src="https://img.shields.io/badge/fork%20of-vaultwarden%2Fvw__web__builds-181717?logo=github">
  <img alt="Base" src="https://img.shields.io/badge/based%20on-bitwarden%20v2026.8.0-2563eb">
  <img alt="Branch" src="https://img.shields.io/badge/branch-shypwd-2563eb">
  <img alt="Version" src="https://img.shields.io/badge/version-2026.8.9-22c55e">
  <img alt="License" src="https://img.shields.io/badge/license-GPL--3.0-22c55e">
</p>

这个仓库是 [Vaultwarden `vw_web_builds`](https://github.com/dani-garcia/vw_web_builds)
（它本身是 [`bitwarden/clients`](https://github.com/bitwarden/clients) 的 fork）的一个 fork。
`shypwd` 分支在官方 `v2026.8.0` 的基础上，承载了 **19 批移动端与体验定制**，
构建产物供 Warden 服务端直接使用。

> ⚠️ 本仓库与 Bitwarden Inc. 无关。「Bitwarden」是其注册商标，本仓库仅用于构建**协议兼容**的前端。

🌐 **简体中文（默认）** ｜ [English](#english)

---

## 目录

- [这个仓库是干什么的](#这个仓库是干什么的)
- [为什么定制写在源码里](#为什么定制写在源码里)
- [改了什么](#改了什么)
- [关键文件](#关键文件)
- [构建](#构建)
- [版本四处](#版本四处)
- [踩过的坑](#踩过的坑)
- [跟进上游](#跟进上游)
- [许可证](#许可证)

---

## 这个仓库是干什么的

它只做一件事：**产出一个移动端好用的 Bitwarden Web Vault 静态包**。

```
本仓库（源码 fork）
   │  GitHub Actions：npm ci → dist:oss:selfhost → 27 组产物断言
   ▼
bw_web_vault-<version>.tar.gz（约 36 MB）
   │
   ▼
warden-worker 仓库的部署流程解压到 public/web-vault/，随 Worker 一起发布
```

配套的后端仓库是 **[`shiranzby/warden-worker`](https://github.com/shiranzby/warden-worker)**。
只有 `apps/web` 会被构建（`apps/browser` / `cli` / `desktop` 不动）。

**仓库约 1.2 GB**（Bitwarden 的 monorepo），所以前端源码没有塞进后端仓库，两者靠 CI 的版本闸门对齐。

---

## 为什么定制写在源码里

早期版本是在**部署后**往页面注入 `custom/custom.js` + `custom.css`（所谓 L4 层）。它有两个致命问题：

1. 它依赖"上游产物的 DOM 结构不变"——上游一改就**静默失效**，没有任何信号。
2. 它无法被构建期检查保护，只能靠人肉点。

改成"定制下沉到源码"之后，每一批定制都能在 **CI 里对真实产物 grep 校验**（现在 27 组），
rebase 丢了哪一批立刻红在哪一组。代价是需要跟着上游 rebase —— 见[跟进上游](#跟进上游)。

---

## 改了什么

定制按"**段**"组织，每段一个标记注释。19 批的逐批记录（需求 → 根因 → 落法 → 验证 → 踩坑 → 回滚）
在后端仓库的 [`docs/webvault-migration-checklist.md`](https://github.com/shiranzby/warden-worker/blob/main/docs/webvault-migration-checklist.md)。

| 段                          | 内容                                                        |
| --------------------------- | ----------------------------------------------------------- |
| `G` / `J` / `J10` / `J11`   | 底部标签栏、二级导航 chips、账户卡片、头像                  |
| `E`                         | 独立「验证码」页                                            |
| `B`                         | 行内 TOTP 徽章（零抖动）                                    |
| `A` / `F` / `I` / `K` / `M` | 输入框、筛选抽屉、行高、间距等基础项                        |
| `N` → `W`                   | 第十 ~ 第十九批：上线后按用户手机反馈做的窄屏修复与体验改造 |

---

## 关键文件

| 路径                                                   | 作用                                                     |
| ------------------------------------------------------ | -------------------------------------------------------- |
| `apps/web/src/css/vaultwarden.css`                     | **定制主战场**（约 12 万字符），按段组织，每段带说明注释 |
| `apps/web/src/app/tools/send/**`                       | 发送页（Send）的模板与逻辑                               |
| `libs/components/src/select/**`                        | 下拉框（贴框展开、躲软键盘、松手才展开）                 |
| `libs/components/src/disclosure/**`、`toggle-group/**` | 折叠面板、切换条                                         |
| `libs/tools/send/**`、`libs/tools/export-vault-ui/**`  | 发送与导出的 UI                                          |
| `apps/web/src/locales/{en,zh_CN}/messages.json`        | 新增的 i18n key                                          |
| `apps/web/package.json` + `package-lock.json`          | **版本真值来源**（两处必须同步）                         |

---

## 构建

```bash
cd apps/web
npm ci
npm run dist:oss:selfhost      # 产物落在 apps/web/build/
```

实际发布走 GitHub Actions（后端仓库的 `build-web-vault.yaml`）：拉本仓库 → `npm ci` →
`dist:oss:selfhost` → 打包 → **27 组产物断言** → 上传 artifact。

> ⚠️ 本地跑 `webpack serve` 会把 `apps/web/build/` 换成开发产物
> （判据：`build/app/` 下出现多个 `main.*.js`），做产物断言前请先停掉 dev server 再重新构建。

---

## 版本四处

版本号**四处必须同时改**，少一处 CI 闸门就会失败：

| #   | 位置                                                     | 当前值      |
| --- | -------------------------------------------------------- | ----------- |
| 1   | `apps/web/package.json` 的 `version`                     | `2026.8.9`  |
| 2   | `package-lock.json` 的 `packages["apps/web"].version`    | `2026.8.9`  |
| 3   | warden-worker `build-web-vault.yaml` 的 `inputs.version` | `v2026.8.9` |
| 4   | warden-worker `push-cloudflare.yaml` 的 `BW_WEB_VERSION` | `v2026.8.9` |

每批只升 **patch 位**，让线上 `/vw-version.json` 自己成为"是否上线成功"的判据。

---

## 踩过的坑

挑几条最容易再犯的，完整版在后端仓库的文档里：

- **两条 `!important` 相撞时比的是权重 (a,b,c)，与书写先后无关。**
  写 `div:has(> textarea)` 只有 (0,0,5)，会被组件的 `has-[textarea]:!tw-py-3`（类，(0,1,0)）压掉 ——
  **产物断言全绿但完全没生效**。把属性写进 `:has()`（`div:has(> textarea[bitInput])`）提到 (0,1,5) 才生效。
- **判据要量"用户看见的东西"**：断言过"输入框本体 38px"（一直是对的），
  但用户看到的是**带边框的可见框** —— 外层还有 12px 内边距，实际 40 vs 64。
- **`bit-toggle-group` 自带 ResizeObserver**：容器窄于 `max-content` 时会把三个切换**换成下拉框**，
  做等分布局时要连 toggle 的内边距一起算。
- **cdk overlay（对话框）不随路由卸载**：它会把后续页面的测量污染成退化值，
  所以运行期探针必须把"量浮层之外的页面"排到打开浮层之前。
- **signal 不能当布尔用**：`ng-select` v21 起 `isOpen` 是 `ModelSignal<boolean>`，
  `if (comp.isOpen)` 恒为真；要调组件的 `toggle()`。

---

## 跟进上游

上游是 [Bitwarden clients](https://github.com/bitwarden/clients)（每月发版）。跟进方式：

```bash
git fetch upstream
git rebase --onto v2026.10.0 v2026.8.0 shypwd
```

**冲突热点**（几乎每次都撞）：

- `apps/web/src/css/vaultwarden.css`（我们改得最多，上游也常动）
- `libs/components/src/{select,disclosure,toggle-group}/**`
- `libs/tools/send/**`
- `apps/web/src/locales/{en,zh_CN}/messages.json`

改完版本四处，跑一次构建 —— CI 的 27 组断言会指出哪一批定制丢了。
**静态断言只能证明"字面量还在"，行为对不对还要再跑一次运行期探针。**

---

## 许可证

本仓库继承 Bitwarden clients 的许可证：

- 主许可证：**GPL-3.0**（见 `LICENSE_GPL.txt` / `LICENSE_BITWARDEN.txt`）
- 「Bitwarden」是 Bitwarden Inc. 的注册商标，本仓库不得用其商标或 Logo 对外宣称。

---

---

# English

<p align="center">
  <strong>A source fork of the Bitwarden Web Vault, mobile-tuned for Warden
  (a Bitwarden-compatible server on Cloudflare Workers)</strong>
</p>

🌐 [简体中文](#vw_web_builds--shypwd-分支)（默认）｜ **English**

This repository is a fork of [Vaultwarden's `vw_web_builds`](https://github.com/dani-garcia/vw_web_builds)
(itself a fork of [`bitwarden/clients`](https://github.com/bitwarden/clients)). The `shypwd` branch
carries **19 batches of mobile and UX customizations** on top of official `v2026.8.0`; its build output
is consumed by the Warden server.

> ⚠️ Not affiliated with Bitwarden Inc. "Bitwarden" is a registered trademark.

## What this repo is for

It has exactly one job: **produce a mobile-friendly Bitwarden Web Vault static bundle.**

```
this repo (source fork)
   │  GitHub Actions: npm ci → dist:oss:selfhost → 27 artifact assertions
   ▼
bw_web_vault-<version>.tar.gz  (≈36 MB)
   │
   ▼
warden-worker unpacks it into public/web-vault/ and publishes it with the Worker
```

The companion backend repo is [`shiranzby/warden-worker`](https://github.com/shiranzby/warden-worker).
Only `apps/web` is built (`browser` / `cli` / `desktop` are untouched).
The repo is ≈1.2 GB, which is why the frontend source is kept separate from the backend.

## Why customizations live in source

We used to inject `custom/custom.js` + `custom.css` after deployment. That approach depended on
upstream's DOM never changing — it broke silently, and no build-time check could catch it.
With customizations in source, every batch is verified by **27 artifact assertions** in CI:
if a rebase drops a batch, CI turns red on that group. The trade-off is that we must rebase
against upstream — see below.

## What changed

Customizations are grouped into labelled "sections" (`G`, `J`, `E`, `B`, `N`…`W`). Per-batch records
(requirement → root cause → fix → verification → pitfalls → rollback) live in the backend repo's
[`docs/webvault-migration-checklist.md`](https://github.com/shiranzby/warden-worker/blob/main/docs/webvault-migration-checklist.md).

Key files: `apps/web/src/css/vaultwarden.css` (the main battlefield, ≈120 KB),
`apps/web/src/app/tools/send/**`, `libs/components/src/{select,disclosure,toggle-group}/**`,
`libs/tools/send/**`, and the i18n message files.

## Build

```bash
cd apps/web && npm ci && npm run dist:oss:selfhost   # output in apps/web/build/
```

The real release runs in GitHub Actions (`build-web-vault.yaml` in the backend repo):
clone → `npm ci` → `dist:oss:selfhost` → package → 27 assertions → upload artifact.

> ⚠️ Running `webpack serve` replaces `apps/web/build/` with dev output; stop the dev server and
> rebuild before running artifact assertions.

## Version pinning — four places

`apps/web/package.json` · `package-lock.json` (`packages["apps/web"].version`) ·
warden-worker `build-web-vault.yaml` `inputs.version` · warden-worker `push-cloudflare.yaml`
`BW_WEB_VERSION` — currently all `2026.8.9` / `v2026.8.9`. Bump the patch digit per batch.

## Pitfalls worth remembering

- **When two `!important` declarations collide, specificity (a,b,c) wins — source order is irrelevant.**
  `div:has(> textarea)` is only (0,0,5) and gets overridden by `has-[textarea]:!tw-py-3` (0,1,0):
  assertions stay green while the rule does nothing. Put the attribute _inside_ `:has()`
  (`div:has(> textarea[bitInput])` → (0,1,5)).
- **Assert against what the user sees**, not internal parts: the input _control_ was 38px (correct)
  while the visible _bordered box_ was 64px because of 12px wrapper padding.
- `bit-toggle-group` has a ResizeObserver that degrades three toggles into a dropdown when the
  container is narrower than `max-content` — account for it when doing equal-width layouts.
- cdk overlays (dialogs) don't unmount on route change and poison later measurements —
  run overlay-free page assertions _before_ opening any dialog.
- Don't use a signal as a boolean: in `ng-select` v21 `isOpen` is a `ModelSignal<boolean>`, so
  `if (comp.isOpen)` is always truthy. Call `toggle()`.

## Keeping up with upstream

```bash
git fetch upstream && git rebase --onto v2026.10.0 v2026.8.0 shypwd
```

Expected conflicts: `vaultwarden.css`, `libs/components/src/{select,disclosure,toggle-group}/**`,
`libs/tools/send/**`, and the i18n message files. After rebasing, bump the four version spots and
run a build — the 27 assertions will tell you which batch broke. Static assertions prove the literal
is still there; run the runtime probes to prove behaviour.

## License

Inherits the Bitwarden clients license: **GPL-3.0** (`LICENSE_GPL.txt`, `LICENSE_BITWARDEN.txt`).
"Bitwarden" is a trademark of Bitwarden Inc.; do not use its marks or logo to imply endorsement.
