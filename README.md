<div align="center">
  <h1>vw_web_builds &middot; shypwd</h1>
  <p><em>Bitwarden Web Vault 的源码分支，为 Warden（Cloudflare Workers 上的 Bitwarden 兼容服务端）提供移动端优化构建。</em></p>

  <img alt="Fork of" src="https://img.shields.io/badge/fork%20of-vaultwarden%2Fvw__web__builds-181717?logo=github">
  <img alt="Based on" src="https://img.shields.io/badge/based%20on-bitwarden%20v2026.8.0-2563eb">
  <img alt="Branch" src="https://img.shields.io/badge/branch-shypwd-2563eb">
  <img alt="Version" src="https://img.shields.io/badge/version-2026.8.9-22c55e">
  <img alt="License" src="https://img.shields.io/badge/license-GPL--3.0-22c55e">
</div>

---

- [English](./README.en.md) | **简体中文**
- [Warden 服务端仓库](https://github.com/shiranzby/warden-worker)
- [改动记录（逐批次）](https://github.com/shiranzby/warden-worker/blob/main/docs/webvault-migration-checklist.md)
- [LICENSE](./LICENSE_GPL.txt)

## 声明

本仓库是 [Vaultwarden `vw_web_builds`](https://github.com/dani-garcia/vw_web_builds) 的分支，
后者本身派生自 [Bitwarden clients](https://github.com/bitwarden/clients)。

- 本仓库与 Bitwarden Inc. **无任何关联**。「Bitwarden」为其注册商标，本仓库仅用于构建协议兼容的前端。
- 本仓库按「原样」提供，不附带任何明示或默示担保。
- 本项目遵循 GPL-3.0 许可证，二次分发时须保留原始版权声明与许可证文本。

## 仓库用途

本仓库的唯一用途是产出一个移动端优化的 Bitwarden Web Vault 静态资源包，供 Warden 服务端部署使用。

```
本仓库（源码分支）
   │  GitHub Actions：npm ci → dist:oss:selfhost → 产物断言
   ▼
bw_web_vault-<version>.tar.gz（约 36 MB）
   │
   ▼
warden-worker 部署流程解压至 public/web-vault/，与 Worker 一同发布
```

构建仅针对 `apps/web`，`apps/browser`、`apps/cli`、`apps/desktop` 不参与。
仓库体积约 1.2 GB，因此与后端仓库分离维护，两者通过构建工作流的版本校验保持一致。

`shypwd` 分支基于官方 `v2026.8.0`。

## 定制内容

所有界面定制均直接写入源码，不使用运行时注入。改动按功能段组织，每段带有说明注释。

- 底部导航栏、二级导航、账户卡片与头像
- 独立「验证码」页与行内 TOTP 徽章
- 单行输入框高度统一与内容垂直居中
- 下拉面板：贴合输入框、避让软键盘、抬起手指后展开
- 发送页布局：移除冗余页头、附加选项可折叠、保存与取消按钮在页面内均分一行
- 深色主题跟随应用内设置

各批次的改动原因、实现方式与验证结果记录于
[改动记录](https://github.com/shiranzby/warden-worker/blob/main/docs/webvault-migration-checklist.md)。

## 目录结构

| 路径                                                                   | 说明                         |
| ---------------------------------------------------------------------- | ---------------------------- |
| `apps/web/src/css/vaultwarden.css`                                     | 样式定制主体，按功能段组织   |
| `apps/web/src/app/tools/send/`                                         | 发送页模板与逻辑             |
| `libs/components/src/select/`                                          | 下拉框组件                   |
| `libs/components/src/disclosure/`、`libs/components/src/toggle-group/` | 折叠面板、切换控件           |
| `libs/tools/send/`                                                     | 发送功能 UI                  |
| `apps/web/src/locales/{en,zh_CN}/messages.json`                        | 新增的本地化条目             |
| `apps/web/package.json`、`package-lock.json`                           | 版本号定义（两处须保持一致） |

## 构建

```bash
cd apps/web
npm ci
npm run dist:oss:selfhost
```

构建产物输出至 `apps/web/build/`。正式发布由后端仓库的 `build-web-vault.yaml` 工作流完成：
拉取本仓库源码、执行构建、校验产物、上传为 Actions artifact。

> 本地运行 `webpack serve` 会将 `apps/web/build/` 替换为开发产物
> （判据：`build/app/` 下出现多个 `main.*.js`）。执行产物校验前应先停止开发服务器并重新构建。

## 与上游同步

上游为 [Bitwarden clients](https://github.com/bitwarden/clients)，按月发布新版本。

```bash
git fetch upstream
git rebase --onto <新版本标签> <当前基线标签> shypwd
```

预期冲突集中在 `apps/web/src/css/vaultwarden.css`、`libs/components/src/{select,disclosure,toggle-group}/`、
`libs/tools/send/` 以及本地化文件。同步完成后需更新后端仓库中定义的版本号，并运行一次完整构建，
以确认定制内容未在变基过程中丢失。

## 贡献

欢迎提交 Issue 与 Pull Request。

- 修改界面样式前，请先确认对应的组件与选择器在目标视口下的实际表现。
- 新增定制应按功能段组织，并在对应位置添加说明注释。
- 涉及新增或修改样式的提交，请同步更新后端仓库中的产物断言。
- 请勿在仓库任何文件中提交账号、密钥或其他凭据。

## 许可证

本仓库遵循 Bitwarden clients 的许可证：

- 主许可证：**GPL-3.0**，详见 [`LICENSE_GPL.txt`](./LICENSE_GPL.txt) 与 [`LICENSE_BITWARDEN.txt`](./LICENSE_BITWARDEN.txt)。
- 「Bitwarden」是 Bitwarden Inc. 的注册商标，本仓库不得使用其商标或标识进行宣传。

## 致谢

- [Bitwarden clients](https://github.com/bitwarden/clients)——源码来源
- [Vaultwarden](https://github.com/dani-garcia/vaultwarden)、[bw_web_builds](https://github.com/dani-garcia/bw_web_builds)
