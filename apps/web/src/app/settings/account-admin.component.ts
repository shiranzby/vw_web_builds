import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from "@angular/core";

import { ToastService } from "@bitwarden/components";

import {
  AccountAdminService,
  AdminRole,
  AdminStats,
  AdminUser,
} from "../layouts/account-admin.service";
import { HeaderModule } from "../layouts/header/header.module";
import { SharedModule } from "../shared";

const ROLE_LABEL: Record<AdminRole, string> = {
  user: "普通用户",
  admin: "管理者",
  owner: "所有者",
};

const ROLE_HINT: Record<AdminRole, string> = {
  user: "只能用自己账号里的密码库",
  admin: "可管理账号（停用/踢下线/重置两步验证），但不能修改别人的角色",
  owner: "全部权限；只有所有者能修改账号角色，可以有多位",
};

/** 下拉里的选项，顺序 = 权限由低到高（与后端 `Role` 的枚举声明顺序一致）。 */
const ROLE_OPTIONS: AdminRole[] = ["user", "admin", "owner"];

/**
 * 设置页里的「账号管理」（`/settings/account-admin`）。
 *
 * 为什么要有这个页面：原来账号管理只能去独立的 `/admin/`，还要另外记一个与账号
 * 完全脱钩的 `ADMIN_TOKEN`；而且那个页面**改不了账号的角色**。现在：
 *   · 入口只在**所有者/管理者**的设置导航里出现（判定见 `AccountAdminService`）；
 *   · 角色直接列在表里，所有者可以就地改；
 *   · `/admin/` 仍然保留，但降级成"应急通道"（密码库打不开时还能用）。
 *
 * 后端端点（本仓库 fork 提供，非上游功能）见 `account-admin.service.ts` 的注释。
 *
 * 交互上刻意与 `/admin/` 对齐（列表 + 「管理」详情弹窗 + 自绘二次确认），
 * 这样两个入口的心智模型一致；二次确认**不用**原生 `confirm()`（规范禁止）。
 */
@Component({
  selector: "app-account-admin",
  templateUrl: "account-admin.component.html",
  imports: [SharedModule, HeaderModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountAdminComponent implements OnInit {
  private readonly adminService = inject(AccountAdminService);
  private readonly toastService = inject(ToastService);

  protected readonly roleOptions = ROLE_OPTIONS;
  protected readonly roleLabel = ROLE_LABEL;

  protected readonly loading = signal(true);
  protected readonly users = signal<AdminUser[]>([]);
  protected readonly stats = signal<AdminStats | null>(null);

  /** 正在被操作（或正在弹详情）的账号 id；用它禁用该行按钮，避免重复提交。 */
  protected readonly busyId = signal<string | null>(null);

  /** 详情弹窗当前展示的账号（null = 关着）。 */
  protected readonly detail = signal<AdminUser | null>(null);

  /** 只有所有者能改角色；管理者的下拉是只读的。 */
  protected readonly canEditRoles = this.adminService.isOwner;

  protected readonly confirmText = signal("");

  private readonly detailDlg = viewChild<ElementRef<HTMLDialogElement>>("detailDlg");
  private readonly confirmDlg = viewChild<ElementRef<HTMLDialogElement>>("confirmDlg");

  /**
   * 二次确认弹窗的 resolver。用 signal 存（仓库 lint 规则
   * `@bitwarden/components/enforce-readonly-angular-properties` 要求类属性只读）。
   */
  private readonly confirmResolve = signal<((ok: boolean) => void) | null>(null);

  /** 表里所有者的数量：降到最后一位时前端也提前拦一下（后端还有一道护栏）。 */
  protected readonly ownerCount = computed(
    () => this.users().filter((u) => u.role === "owner").length,
  );

  async ngOnInit(): Promise<void> {
    // 布局已经拉过一次，这里是幂等的；直接进 URL 时也能自己拉回来。
    await this.adminService.ensureLoaded();
    await this.reload();
  }

  protected async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const [users, stats] = await Promise.all([
        this.adminService.listUsers(),
        this.adminService.loadStats(),
      ]);
      this.users.set(users);
      this.stats.set(stats);
    } catch (e) {
      this.toastService.showToast({ variant: "error", message: this.msg(e) });
    } finally {
      this.loading.set(false);
    }
  }

  /* ------------------------------ 详情弹窗 ------------------------------ */

  protected openDetail(user: AdminUser): void {
    this.detail.set(user);
    this.detailDlg()?.nativeElement.showModal();
  }

  protected closeDetail(): void {
    this.detailDlg()?.nativeElement.close();
    this.detail.set(null);
  }

  /* ------------------------------- 动作 -------------------------------- */

  /** 改角色 —— 只有所有者能走到这里（后端也会再拦一次）。 */
  protected async changeRole(user: AdminUser, role: string): Promise<void> {
    const next = this.asRole(role);
    if (next === user.role) {
      return;
    }
    if (!(await this.confirm(`确定把 ${user.email} 设为「${ROLE_LABEL[next]}」吗？`))) {
      return;
    }
    await this.run(user, () => this.adminService.action(user.id, "role", { role: next }));
  }

  protected async signOut(user: AdminUser): Promise<void> {
    if (!(await this.confirm(`让 ${user.email} 在所有设备上立即退出登录？`))) {
      return;
    }
    await this.run(user, () => this.adminService.action(user.id, "sign-out"));
  }

  protected async reset2fa(user: AdminUser): Promise<void> {
    if (!(await this.confirm(`清除 ${user.email} 的两步验证？下次登录将不再要求验证码。`))) {
      return;
    }
    await this.run(user, () => this.adminService.action(user.id, "reset-2fa"));
  }

  protected async setExpire(user: AdminUser, days: number | null): Promise<void> {
    const text =
      days === null
        ? `取消 ${user.email} 的到期时间（改为永不过期）？`
        : `把 ${user.email} 设为 ${days} 天后到期？到期后账号会被停用（不会删除）。`;
    if (!(await this.confirm(text))) {
      return;
    }
    await this.run(user, () => this.adminService.action(user.id, "expire", { days }));
  }

  protected async toggleDisabled(user: AdminUser): Promise<void> {
    const next = user.disabledAt === null;
    const text = next
      ? `停用 ${user.email}？该账号会立刻在所有设备上退出，且无法再登录（数据保留）。`
      : `恢复 ${user.email} 的登录？`;
    if (!(await this.confirm(text))) {
      return;
    }
    await this.run(user, () => this.adminService.action(user.id, "disable", { disabled: next }));
  }

  protected async remove(user: AdminUser): Promise<void> {
    if (
      !(await this.confirm(
        `删除 ${user.email} 及其全部密码库条目？\n\n此操作不可撤销，附件也会一并从存储中删除。`,
      ))
    ) {
      return;
    }
    await this.run(user, () => this.adminService.deleteUser(user.id));
  }

  private async run(user: AdminUser, call: () => Promise<string>): Promise<void> {
    this.busyId.set(user.id);
    try {
      const message = await call();
      this.toastService.showToast({ variant: "success", message });
      await this.reload();
      // 详情弹窗里的按钮状态依赖列表数据，刷新后把弹窗内容同步过去。
      const fresh = this.users().find((u) => u.id === user.id);
      this.detail.set(fresh ?? null);
      if (!fresh) {
        this.closeDetail();
      }
    } catch (e) {
      this.toastService.showToast({ variant: "error", message: this.msg(e) });
    } finally {
      this.busyId.set(null);
    }
  }

  /* ---------------------------- 二次确认弹窗 ---------------------------- */

  /** 自绘确认；**不用**原生 `confirm()`。返回用户是否点了「确认执行」。 */
  private confirm(text: string): Promise<boolean> {
    this.confirmText.set(text);
    this.confirmDlg()?.nativeElement.showModal();
    return new Promise<boolean>((resolve) => {
      this.confirmResolve.set(resolve);
    });
  }

  protected answerConfirm(ok: boolean): void {
    this.confirmDlg()?.nativeElement.close();
    const resolve = this.confirmResolve();
    this.confirmResolve.set(null);
    resolve?.(ok);
  }

  /* ------------------------------- 展示 -------------------------------- */

  protected roleHint(role: AdminRole): string {
    return ROLE_HINT[role];
  }

  /** 无法操作时必须**说明原因**，不能只是一颗灰按钮。 */
  protected lockReason(user: AdminUser): string {
    if (!user.manageable) {
      return "管理者不能操作所有者账号";
    }
    if (!user.roleEditable) {
      return "只有所有者可以修改角色";
    }
    return "";
  }

  protected statusText(user: AdminUser): string {
    if (user.disabledAt) {
      return "已停用";
    }
    const left = this.daysLeft(user.expiresAt);
    if (left === null) {
      return "正常";
    }
    if (left <= 0) {
      return "已到期";
    }
    return left <= 7 ? `${left} 天后到期` : "正常";
  }

  protected statusKind(user: AdminUser): "ok" | "warn" | "off" {
    if (user.disabledAt) {
      return "off";
    }
    const left = this.daysLeft(user.expiresAt);
    if (left === null) {
      return "ok";
    }
    return left <= 7 ? "warn" : "ok";
  }

  protected fmtDate(iso: string | null): string {
    if (!iso) {
      return "—";
    }
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
      return "—";
    }
    const p = (n: number): string => (n < 10 ? `0${n}` : String(n));
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(
      d.getMinutes(),
    )}`;
  }

  private daysLeft(iso: string | null): number | null {
    if (!iso) {
      return null;
    }
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) {
      return null;
    }
    return Math.ceil((t - Date.now()) / 86400000);
  }

  private asRole(value: string): AdminRole {
    return value === "owner" || value === "admin" ? value : "user";
  }

  private msg(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }
}
