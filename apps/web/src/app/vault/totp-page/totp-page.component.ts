import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { filter, switchMap } from "rxjs";

import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { getUserId } from "@bitwarden/common/auth/services/account.service";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";

import { VaultTotpBadgeComponent } from "../components/vault-items/totp-badge.component";

/**
 * 独立「验证码」页 —— 迁移自 L4 的 J16（`custom/custom.js` §9）+ E 段（`custom/custom.css`），
 * 复刻 Bitwarden Authenticator 的卡片式列表。
 *
 * 与 L4 的差别, 同样是"消掉运行期机制":
 *
 * | 维度 | L4（运行期注入） | 这里 |
 * |---|---|---|
 * | 呈现 | `custom.js` 往 `document.body` 注入 `#warden-authview`, 由 `body.warden-authview-on` 开关盖在密码库页上 | 真路由 `/totp`, 由 `oss-routing.module.ts` 声明, 随 `<router-outlet>` 落进 `main#main-content` |
 * | 取数据 | 自己维护的 `index`（§4 建索引: 解密 name/username/totp, 且**跳过组织条目**） | 官方 `CipherService.cipherViews$(userId)` —— 已是解密后的 `CipherView[]`, 组织条目也在其中 |
 * | 渲染 | 手写 `innerHTML` / `createElement` + 手工 `renderAuthList()` 重入 | `@for` + `computed`, 数据变了自动重渲染 |
 * | 徽章 | 复用 `makeBadge(c)`（§6 自写 TOTP 算法） | 复用 `vault-totp-badge`（官方 `TotpService`, 与列表行同一个组件） |
 * | 搜索 | `input` 事件里读 `.warden-auth-search` 的 value 再全量重建 DOM | `signal` + `computed` 过滤 |
 *
 * 两处刻意保留 / 刻意去掉的东西:
 *
 *   1. **保留** 自己的搜索框。官方 `bit-table` 那套搜索属于密码库页, 这里是复刻 Authenticator
 *      的独立列表, L4 上验收的视觉稿也带这个框。
 *   2. **去掉** `warden-auth-count`。L4 的 `renderAuthList()` 里有一行
 *      `document.querySelector(".warden-auth-count").textContent = index.length`,
 *      但 `ensureAuthView()` **从来没有创建过这个节点** —— 线上是一句空跑的死代码,
 *      所以这里不迁（迁移的是行为, 不是行数）。
 *
 * 与列表行同口径: 只要 `login.totp` 有值就入列(不看 premium, 不看组织)。L4 额外在
 * `parseTotp()` 失败时静默跳过坏 URI —— 那需要一份自写解析器; 源码层不重复实现,
 * 坏 URI 的后果只是该行徽章为空（`totp-badge` 内部已 `catchError` 兜住, 不会掀掉整页）。
 */
@Component({
  selector: "app-totp-page",
  templateUrl: "./totp-page.component.html",
  imports: [VaultTotpBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TotpPageComponent {
  private readonly accountService = inject(AccountService);
  private readonly cipherService = inject(CipherService);

  /** 搜索框内容。用 signal 而不是 `[(ngModel)]`, 与同目录其它定制组件保持一致。 */
  protected readonly query = signal("");

  /**
   * 当前账号下所有已解密的条目。
   *
   * `filter(account != null)` 是必要的: `getUserId` 在 account 为 null 时**抛异常**
   * （见 `account.service.ts` 的注释）, 而登出/切号瞬间 `activeAccount$` 会先吐 null。
   */
  private readonly ciphers = toSignal(
    this.accountService.activeAccount$.pipe(
      filter((account) => account != null),
      getUserId,
      switchMap((userId) => this.cipherService.cipherViews$(userId)),
    ),
    { initialValue: [] as CipherView[] },
  );

  /** 有验证码、未删除、且命中搜索词的条目。顺序沿用 `cipherViews$`（不额外排序）。 */
  protected readonly items = computed<CipherView[]>(() => {
    const q = this.query().trim().toLowerCase();

    return this.ciphers().filter((cipher) => {
      if (cipher.isDeleted || !cipher.login?.totp) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        cipher.name.toLowerCase().includes(q) ||
        (cipher.login?.username ?? "").toLowerCase().includes(q)
      );
    });
  });

  /** 全库有验证码的条目数 —— 空状态要区分"搜不到"和"一个都没有"。 */
  protected readonly total = computed(
    () => this.ciphers().filter((cipher) => !cipher.isDeleted && !!cipher.login?.totp).length,
  );

  protected onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }
}
