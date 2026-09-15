<div align="center">
  <h1>vw_web_builds &middot; shypwd</h1>
  <p><em>A source branch of the Bitwarden Web Vault, providing mobile-optimized builds for Warden, a Bitwarden-compatible server on Cloudflare Workers.</em></p>

  <img alt="Fork of" src="https://img.shields.io/badge/fork%20of-vaultwarden%2Fvw__web__builds-181717?logo=github">
  <img alt="Based on" src="https://img.shields.io/badge/based%20on-bitwarden%20v2026.8.0-2563eb">
  <img alt="Branch" src="https://img.shields.io/badge/branch-shypwd-2563eb">
  <img alt="Version" src="https://img.shields.io/badge/version-2026.8.9-22c55e">
  <img alt="License" src="https://img.shields.io/badge/license-GPL--3.0-22c55e">
</div>

---

- **English** | [简体中文](./README.md)
- [Warden server repository](https://github.com/shiranzby/warden-worker)
- [Change log (per batch)](https://github.com/shiranzby/warden-worker/blob/main/docs/webvault-migration-checklist.md) (Chinese)
- [LICENSE](./LICENSE_GPL.txt)

## Disclaimer

This repository is a branch of [Vaultwarden's `vw_web_builds`](https://github.com/dani-garcia/vw_web_builds),
which in turn derives from [Bitwarden clients](https://github.com/bitwarden/clients).

- This repository is **not affiliated with Bitwarden Inc.** "Bitwarden" is a registered trademark of
  Bitwarden Inc.; this repository is used solely to build a protocol-compatible frontend.
- This software is provided "as is", without warranty of any kind, express or implied.
- This project is licensed under GPL-3.0. Redistribution must retain the original copyright notices
  and license texts.

## Purpose

The sole purpose of this repository is to produce a mobile-optimized Bitwarden Web Vault static bundle
for the Warden server to deploy.

```
this repository (source branch)
   │  GitHub Actions: npm ci → dist:oss:selfhost → artifact assertions
   ▼
bw_web_vault-<version>.tar.gz  (≈36 MB)
   │
   ▼
the warden-worker deployment unpacks it into public/web-vault/ and publishes it with the Worker
```

Only `apps/web` is built; `apps/browser`, `apps/cli` and `apps/desktop` are not involved.
The repository is about 1.2 GB, which is why it is maintained separately from the backend and the two
are kept consistent by the build workflow's version check.

The `shypwd` branch is based on upstream `v2026.8.0`.

## Customizations

All UI customizations are written directly into the source; no runtime injection is used.
Changes are organized into labeled feature sections, each accompanied by explanatory comments.

- Bottom tab bar, secondary navigation, account card and avatar
- Dedicated authenticator page and inline TOTP badge
- Uniform single-line input heights with vertically centered content
- Dropdown panels that open flush against the field, avoid the soft keyboard, and expand on pointer release
- Send page layout: redundant header removed, extra options collapsible, Save and Cancel split one row in-page
- Dark theme follows the in-app setting

The rationale, implementation and verification for each batch are recorded in the
[change log](https://github.com/shiranzby/warden-worker/blob/main/docs/webvault-migration-checklist.md).

## Project structure

| Path                                                                   | Description                                                          |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `apps/web/src/css/vaultwarden.css`                                     | Main stylesheet for the customizations, organized by feature section |
| `apps/web/src/app/tools/send/`                                         | Send page template and logic                                         |
| `libs/components/src/select/`                                          | Dropdown component                                                   |
| `libs/components/src/disclosure/`, `libs/components/src/toggle-group/` | Disclosure panel, toggle controls                                    |
| `libs/tools/send/`                                                     | Send feature UI                                                      |
| `apps/web/src/locales/{en,zh_CN}/messages.json`                        | Added localization entries                                           |
| `apps/web/package.json`, `package-lock.json`                           | Version definition (both must stay in sync)                          |

## Build

```bash
cd apps/web
npm ci
npm run dist:oss:selfhost
```

Output is written to `apps/web/build/`. Official releases are produced by the backend repository's
`build-web-vault.yaml` workflow, which clones this repository, builds it, verifies the artifact and
uploads it as an Actions artifact.

> Running `webpack serve` locally replaces `apps/web/build/` with development output
> (detectable when multiple `main.*.js` files appear under `build/app/`). Stop the dev server and
> rebuild before running artifact verification.

## Staying in sync with upstream

Upstream is [Bitwarden clients](https://github.com/bitwarden/clients), released monthly.

```bash
git fetch upstream
git rebase --onto <new-tag> <current-base-tag> shypwd
```

Conflicts are expected in `apps/web/src/css/vaultwarden.css`,
`libs/components/src/{select,disclosure,toggle-group}/`, `libs/tools/send/` and the localization files.
After rebasing, update the version defined in the backend repository and run a full build to confirm
no customization was lost during the rebase.

## Contributing

Issues and pull requests are welcome.

- Before changing styles, verify the actual behavior of the relevant component and selector at the target viewport.
- Organize new customizations into feature sections and add explanatory comments.
- Commits that add or modify styles should update the artifact assertions in the backend repository.
- Never commit accounts, keys, or other credentials to any file in the repository.

## License

This repository follows the Bitwarden clients license:

- Primary license: **GPL-3.0**, see [`LICENSE_GPL.txt`](./LICENSE_GPL.txt) and [`LICENSE_BITWARDEN.txt`](./LICENSE_BITWARDEN.txt).
- "Bitwarden" is a trademark of Bitwarden Inc.; do not use its marks or logo for promotion.

## Acknowledgements

- [Bitwarden clients](https://github.com/bitwarden/clients) — source of the codebase
- [Vaultwarden](https://github.com/dani-garcia/vaultwarden), [bw_web_builds](https://github.com/dani-garcia/bw_web_builds)
