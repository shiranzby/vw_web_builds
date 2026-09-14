import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  OnInit,
  viewChild,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { NavigationEnd, Router } from "@angular/router";
import { filter, map, startWith } from "rxjs";

import { LockService, LogoutService } from "@bitwarden/auth/common";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { TokenService } from "@bitwarden/common/auth/abstractions/token.service";
import { ToastService } from "@bitwarden/components";

/** L4 的头像本地缓存键前缀；G4 就是按这个前缀找 localStorage 有没有落地。 */
const AVATAR_KEY_PREFIX = "warden.avatar.v1.";

/** 头像统一压成 128×128 的 jpeg，够清楚又不至于把 /api/sync 撑大。 */
const AVATAR_SIZE = 128;
const AVATAR_QUALITY = 0.85;

/**
 * 设置页顶部的账户卡片 —— 迁移自 L4 的 J10（`custom/custom.js` §7.2）+ J3 + J10 段
 * （`custom/custom.css`），桌面端与窄屏**同一套排布**（头像在左、名称/邮箱在右）。
 *
 * 为什么需要它：窄屏把 `app-account-menu`（页头的头像菜单，锁定/注销在里面）整个收掉了，
 * 那两个动作必须有去处；同时「我的账户」页原来那行 64px 大头像 + 只改底色的「自定义」
 * 按钮也被取代。于是账户身份 + 锁定/注销 + 换头像集中到这一张卡片。
 *
 * 相对 L4 的三处简化：
 *   1. 锁定 / 注销直接调官方服务（`LockService.lock` / `LogoutService.logout`），
 *      不再用 L4 那种"点开官方菜单、再按中文文案找到菜单项替它点一下"的做法
 *      （L4 甚至要先给浮层挂 `warden-ghost-menu` 隐身类，因为头像被藏起来后
 *      浮层会锚在 (0,0) 闪一下）；
 *   2. 取 token 走官方 `TokenService.getAccessToken()`，不再劫持 `window.fetch` /
 *      `XMLHttpRequest.prototype.open` 去偷 Authorization 头；
 *   3. 卡片是模板的一部分，路由判断由 `computed` 从 URL 派生，不再由 JS 在
 *      MutationObserver + 定时器里 removeChild/insertBefore。
 *
 * ⚠️ 保留了一处 L4 的运行期契约：头像地址写在 `body` 的 `--warden-avatar` 变量 +
 *    `warden-avatar-on` 类上（G4 直接断言 `document.body.classList`）。CSS 因此与 L4 一致：
 *    `body.warden-avatar-on .warden-acct-avatar { background-image: var(--warden-avatar) }`。
 *
 * 后端端点（由本仓库 fork 提供，非上游功能）：
 *   GET    /api/accounts/avatar        -> { avatarColor, avatarImage }
 *   PUT    /api/accounts/avatar/image  -> 存图片(data URL)，返回同上
 */
@Component({
  selector: "app-account-card",
  templateUrl: "./account-card.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountCardComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly accountService = inject(AccountService);
  private readonly tokenService = inject(TokenService);
  private readonly lockService = inject(LockService);
  private readonly logoutService = inject(LogoutService);
  private readonly toastService = inject(ToastService);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  private readonly account = toSignal(this.accountService.activeAccount$);

  /** 头像用的隐藏文件选择器（只在卡片渲染出来时才存在）。 */
  private readonly avatarInput = viewChild<ElementRef<HTMLInputElement>>("avatarInput");

  /**
   * 只在「我的账户」页显示。
   *
   * 原来只要路径以 `/settings` 开头就显示, 于是切到「安全」「外观」「域名规则」… 时,
   * 二级导航下面**一直**横着这张卡(用户明确要求: "这个部分仅存在于我的账户页")。
   * 收窄到 `/settings/account` 后, 其它设置页不再渲染它; 页头右上角那个头像菜单
   * 也不会因此在窄屏冒出来 —— 它是被 `css/vaultwarden.css` 的 F 段无条件藏掉的
   * (`main#main-content app-account-menu { display: none }`), 与这张卡无关。
   */
  protected readonly visible = computed(() => {
    const path = this.path();
    return path === "/settings/account" || path.startsWith("/settings/account/");
  });

  /** profile.name 可能为空 —— 那就把邮箱提到主行，别显示一个空标题。 */
  protected readonly name = computed(() => {
    const a = this.account();
    return a?.name || a?.email || "账户";
  });

  protected readonly mail = computed(() => (this.account()?.name ? this.account()!.email : ""));

  protected readonly initial = computed(() => this.toInitials(this.name()));

  ngOnInit(): void {
    /* 先用 localStorage 里那份渲染（不等网络，也就不闪），再向后端要一次，
       把"别的设备上改过的头像"同步过来。本组件挂在布局上、整个会话只创建一次，
       所以这个"只拉一次"的语义等价于 L4 的模块级 avPulled 标志。 */
    this.applyAvatar(this.readStoredAvatar());
    void this.pullAvatarFromServer();
  }

  protected pickAvatar(): void {
    this.avatarInput()?.nativeElement.click();
  }

  protected onAvatarFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => this.cropAndUpload(String(reader.result));
    reader.readAsDataURL(file);
  }

  protected async lock(): Promise<void> {
    const userId = this.account()?.id;
    if (userId) {
      await this.lockService.lock(userId);
    }
  }

  protected async logout(): Promise<void> {
    const userId = this.account()?.id;
    if (!userId || !window.confirm("确定要注销当前账户吗？")) {
      return;
    }
    await this.logoutService.logout(userId);
  }

  /** 居中裁成正方形 → 128px jpeg。先本地生效（点完马上能看到），再推给后端。 */
  private cropAndUpload(dataUrl: string): void {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = AVATAR_SIZE;
        canvas.height = AVATAR_SIZE;
        const ctx = canvas.getContext("2d")!;
        const side = Math.min(img.width, img.height);
        ctx.drawImage(
          img,
          (img.width - side) / 2,
          (img.height - side) / 2,
          side,
          side,
          0,
          0,
          AVATAR_SIZE,
          AVATAR_SIZE,
        );
        const jpeg = canvas.toDataURL("image/jpeg", AVATAR_QUALITY);
        this.writeStoredAvatar(jpeg);
        this.applyAvatar(jpeg);
        void this.avatarApi("/image", {
          method: "PUT",
          body: JSON.stringify({ image: jpeg }),
        })
          .then(() => {
            this.toastService.showToast({
              variant: "success",
              message: "头像已更新, 并已同步到你的账户",
            });
          })
          .catch((e: unknown) => {
            this.toastService.showToast({
              variant: "error",
              message: `头像已在本机生效, 但同步失败: ${this.msg(e)}`,
            });
          });
      } catch (e) {
        this.toastService.showToast({ variant: "error", message: `图片处理失败: ${this.msg(e)}` });
      }
    };
    img.onerror = () => {
      this.toastService.showToast({ variant: "error", message: "无法读取该图片" });
    };
    img.src = dataUrl;
  }

  private async pullAvatarFromServer(): Promise<void> {
    try {
      const data = await this.avatarApi("");
      const image = data?.avatarImage ?? null;
      this.writeStoredAvatar(image);
      this.applyAvatar(image);
    } catch {
      /* 未登录 / 401 / 网络失败都直接放弃：localStorage 那份还在，
         下次进设置页（组件重建）会再试一次。 */
    }
  }

  private async avatarApi(
    path = "",
    init: RequestInit = {},
  ): Promise<{ avatarImage?: string | null } | null> {
    const account = this.account();
    if (!account) {
      throw new Error("尚未登录");
    }
    const token = await this.tokenService.getAccessToken(account.id);
    if (!token) {
      throw new Error("尚未登录");
    }
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (init.body) {
      headers["Content-Type"] = "application/json";
    }
    const res = await fetch(`/api/accounts/avatar${path}`, { ...init, headers });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text ? text.slice(0, 80) : `HTTP ${res.status}`);
    }
    return (await res.json()) as { avatarImage?: string | null };
  }

  private applyAvatar(url: string | null): void {
    if (url) {
      document.body.style.setProperty("--warden-avatar", `url("${url}")`);
      document.body.classList.add("warden-avatar-on");
    } else {
      document.body.style.removeProperty("--warden-avatar");
      document.body.classList.remove("warden-avatar-on");
    }
  }

  private readStoredAvatar(): string | null {
    try {
      return localStorage.getItem(this.avatarKey());
    } catch {
      return null; // 隐私模式
    }
  }

  private writeStoredAvatar(url: string | null): void {
    try {
      if (url) {
        localStorage.setItem(this.avatarKey(), url);
      } else {
        localStorage.removeItem(this.avatarKey());
      }
    } catch {
      /* 隐私模式：只管这次会话 */
    }
  }

  private avatarKey(): string {
    const a = this.account();
    return AVATAR_KEY_PREFIX + (a?.id || a?.email || "default");
  }

  /** 与官方 `bit-avatar` 同一套规则：多段名字取前两段首字母，否则取前两个字符。 */
  private toInitials(text: string): string {
    const trimmed = text.trim();
    if (!trimmed) {
      return "?";
    }
    const parts = trimmed.split(" ");
    if (parts.length > 1) {
      return ([...parts[0]][0] + ([...parts[1]][0] ?? "")).toUpperCase();
    }
    return ([...trimmed].slice(0, 2).join("") || "?").toUpperCase();
  }

  private msg(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }

  private path(): string {
    return this.url().split("?")[0].split("#")[0];
  }
}
