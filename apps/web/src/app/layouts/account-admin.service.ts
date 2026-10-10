import { computed, effect, inject, Injectable, signal } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";

import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { TokenService } from "@bitwarden/common/auth/abstractions/token.service";
import { UserId } from "@bitwarden/common/types/guid";

/**
 * 账号角色，与后端 `users.role` 一一对应（见 `src/handlers/admin.rs` 的 `Role`）。
 * `user < admin < owner`，其中 `owner` 可以有多位。
 */
export type AdminRole = "user" | "admin" | "owner";

export type AdminIdentity = {
  role: AdminRole;
  isAdmin: boolean;
  isOwner: boolean;
  userId: string;
  email: string;
  name: string;
};

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  /** 当前调用者能不能改这个人的角色（**仅所有者**为真）—— 前端据此决定下拉是否可选。 */
  roleEditable: boolean;
  /** 当前调用者能不能对这一行执行生命周期动作（管理者不得动所有者）。 */
  manageable: boolean;
  emailVerified: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  expiresAt: string | null;
  disabledAt: string | null;
  items: number;
  devices: number;
  hasTotp: boolean;
};

export type AdminStats = {
  users: number;
  items: number;
  totp: number;
  disabled: number;
  expiring: number;
};

/** 生命周期动作，对应 `/api/admin/users/{id}/<op>`。`role` 走同一个形状但**仅所有者**可用。 */
export type AdminAction = "sign-out" | "reset-2fa" | "expire" | "disable" | "role";

/** 后端 JSON 里每个用户的样子（snake_case，与 `admin.rs::list_users` 一一对应）。 */
type RawUser = {
  id: string;
  email: string;
  name?: string;
  role?: string;
  role_editable?: boolean;
  manageable?: boolean;
  email_verified?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  expires_at?: string | null;
  disabled_at?: string | null;
  items?: number;
  devices?: number;
  has_totp?: boolean;
};

const asRole = (value: string | undefined): AdminRole =>
  value === "owner" || value === "admin" ? value : "user";

/**
 * 「当前账号的管理身份」+「账号管理接口的客户端」。
 *
 * 为什么需要它：管理入口要出现在**设置页的导航里**，而导航由布局组件渲染 ——
 * 也就是说"我到底是不是所有者/管理者"这件事必须在**页面组件之外**就能读到。
 * 所以身份状态放在这个 root 级服务里：布局（决定要不要显示入口）与管理页
 * （决定要不要显示"改角色"控件）读的是**同一份**判定结果，不会各拉各的。
 *
 * 后端端点（由本仓库 fork 提供，非上游功能）：
 *   GET    /api/admin/me                -> 只认会话，返回自己的 role
 *   GET    /api/admin/users             -> 账号列表（含 role）
 *   GET    /api/admin/stats             -> 概览计数
 *   POST   /api/admin/users/{id}/role   -> 改角色（**仅所有者**）
 *   POST   /api/admin/users/{id}/{sign-out|reset-2fa|expire|disable}
 *   DELETE /api/admin/users/{id}
 *
 * ⚠️ `isAdmin()` **默认为 false**，判出来才变 true。反过来（默认显示、判完再藏）
 *    会让每个普通用户都看到入口闪一下 —— 宁可是管理员多等半秒。
 */
@Injectable({ providedIn: "root" })
export class AccountAdminService {
  private readonly accountService = inject(AccountService);
  private readonly tokenService = inject(TokenService);

  private readonly account = toSignal(this.accountService.activeAccount$);

  private readonly identitySignal = signal<AdminIdentity | null>(null);

  /** `null` = 还没判出来（未登录 / 正在拉 / 后端还没有这个端点）。 */
  readonly identity = this.identitySignal.asReadonly();

  readonly isAdmin = computed(() => this.identitySignal()?.isAdmin === true);
  readonly isOwner = computed(() => this.identitySignal()?.isOwner === true);

  /** 已经为哪个账号拉过身份。切换账号后会自动重拉（见 `ensureLoaded`）。 */
  private loadedFor: string | null = null;

  constructor() {
    /*
     * 账号一就绪就自动判一次身份 —— 由 effect 驱动而不是让各个组件自己去调，
     * 是为了把"什么时候能拉"这件事收在一处：
     *   · 布局可能在 activeAccount$ 还没 emit 之前就创建，此时 `ensureLoaded` 会
     *     因为拿不到账号而直接返回；等账号到了再调一次才对；
     *   · 注销后 account 变 null，顺手把身份清空，避免下一个登录者短暂看到上一个
     *     账号的权限。
     * effect 只依赖 `account()`，写 `identity` 不会反过来再触发它。
     */
    effect(() => {
      const account = this.account();
      if (!account) {
        this.loadedFor = null;
        this.identitySignal.set(null);
        return;
      }
      void this.ensureLoaded();
    });
  }

  /**
   * 幂等：同一个账号只拉一次。组件也可以显式调它（重复调用不会多发请求）。
   * 失败**不**锁定 —— 否则一次网络抖动就会让入口永远不出现。
   */
  async ensureLoaded(): Promise<void> {
    const account = this.account();
    if (!account || this.loadedFor === account.id) {
      return;
    }
    this.loadedFor = account.id;
    if (!(await this.loadIdentity(account.id))) {
      this.loadedFor = null;
    }
  }

  /** 注销时清空，避免下一个登录者短暂看到上一个账号的权限。 */
  clear(): void {
    this.loadedFor = null;
    this.identitySignal.set(null);
  }

  // `accountId` 用 `UserId`（branded type）而不是裸 string：TokenService.getAccessToken()
  // 要求这个类型，而 `activeAccount$` 的 `id` 本来就是它 —— 我们只是把它当参数传了下来，
  // 类型不能在半路被"洗"成 string。
  private async loadIdentity(accountId: UserId): Promise<boolean> {
    try {
      const res = await this.fetchWithToken("/api/admin/me", accountId);
      // 401（未登录）/ 404（后端还没这个端点）/ 503（未配置）一律当作"没有管理身份"：
      // 这不是错误，只是"用不了这个功能"，界面安静地不显示入口即可。
      if (!res.ok) {
        return false;
      }
      const data = (await res.json()) as {
        ok?: boolean;
        role?: string;
        is_admin?: boolean;
        is_owner?: boolean;
        user_id?: string;
        email?: string;
        name?: string;
      };
      if (!data?.ok) {
        return false;
      }
      this.identitySignal.set({
        role: asRole(data.role),
        isAdmin: data.is_admin === true,
        isOwner: data.is_owner === true,
        userId: data.user_id ?? accountId,
        email: data.email ?? "",
        name: data.name ?? "",
      });
      return true;
    } catch {
      return false;
    }
  }

  /* ------------------------------ 数据接口 ------------------------------ */

  async listUsers(): Promise<AdminUser[]> {
    const data = await this.request<{ users?: RawUser[] }>("/api/admin/users");
    return (data.users ?? []).map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name ?? "",
      role: asRole(r.role),
      roleEditable: r.role_editable === true,
      manageable: r.manageable !== false,
      emailVerified: r.email_verified === true,
      createdAt: r.created_at ?? null,
      updatedAt: r.updated_at ?? null,
      expiresAt: r.expires_at ?? null,
      disabledAt: r.disabled_at ?? null,
      items: Number(r.items) || 0,
      devices: Number(r.devices) || 0,
      hasTotp: r.has_totp === true,
    }));
  }

  async loadStats(): Promise<AdminStats> {
    const data = await this.request<{ stats?: Partial<AdminStats> }>("/api/admin/stats");
    return {
      users: Number(data.stats?.users) || 0,
      items: Number(data.stats?.items) || 0,
      totp: Number(data.stats?.totp) || 0,
      disabled: Number(data.stats?.disabled) || 0,
      expiring: Number(data.stats?.expiring) || 0,
    };
  }

  /** 执行一个生命周期动作，返回后端给的**可直接展示**的中文提示。 */
  async action(id: string, op: AdminAction, body?: unknown): Promise<string> {
    const init: RequestInit = { method: "POST" };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    const data = await this.request<{ message?: string }>(
      `/api/admin/users/${encodeURIComponent(id)}/${op}`,
      init,
    );
    return data.message ?? "已完成";
  }

  async deleteUser(id: string): Promise<string> {
    const data = await this.request<{ message?: string }>(
      `/api/admin/users/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    return data.message ?? "账号已删除";
  }

  /* ------------------------------- 底层 ------------------------------- */

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const account = this.account();
    if (!account) {
      throw new Error("尚未登录");
    }
    const headers: Record<string, string> = {};
    if (init.body) {
      headers["Content-Type"] = "application/json";
    }
    const res = await this.fetchWithToken(path, account.id, { ...init, headers });

    const text = await res.text();
    let parsed: Record<string, unknown> = {};
    if (text) {
      try {
        parsed = JSON.parse(text) as Record<string, unknown>;
      } catch {
        parsed = {};
      }
    }
    if (!res.ok) {
      // 后端所有错误体都带 `message`（见 src/error.rs 的注释），优先用它。
      const message = parsed["message"];
      throw new Error(typeof message === "string" && message ? message : `HTTP ${res.status}`);
    }
    return parsed as T;
  }

  private async fetchWithToken(
    path: string,
    accountId: UserId,
    init: RequestInit = {},
  ): Promise<Response> {
    const token = await this.tokenService.getAccessToken(accountId);
    if (!token) {
      throw new Error("尚未登录");
    }
    const headers: Record<string, string> = {
      ...((init.headers as Record<string, string>) ?? {}),
      Authorization: `Bearer ${token}`,
    };
    return await fetch(path, { ...init, headers });
  }
}
