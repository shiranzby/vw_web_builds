import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { NavigationEnd, Router, RouterModule } from "@angular/router";
import { filter, map, startWith } from "rxjs";

type SubNavItem = { label: string; route: string };
type SubNavSet = { prefix: string; items: SubNavItem[] };

/**
 * 窄屏「二级导航」chips —— 迁移自 L4 的 J11（`custom/custom.js` §7.3）+ J 段（`custom/custom.css`）。
 *
 * 为什么需要它：应用桌面版本质是三分栏（侧栏一级 + 每个分区自己的二级导航）。窄屏下
 * 侧栏被收成一条图标导轨、再由 F5 段整个 `display:none`（一级交给底部标签栏），
 * 二级就**没有任何替代** —— 「设置」页只剩「我的账户」，进不去 安全/外观/域名规则/紧急访问；
 * 「工具」页困在生成器里，出不去 导入/导出。这里给这两类页面各补一条横向 chip 导航。
 *
 * 为什么是"自己列一份条目"而不是复用官方 `bit-nav-group` 里的子项：
 *   `nav-group.component.html` 的子项渲染条件是 `sideNavOpen() && open()`
 *   （`SideNavService.open` 是侧栏是否展开，窄屏恒为 false），也就是**窄屏下那些子项
 *   根本不在 DOM 里**，没有可复用的节点。要复用就得改官方导航组件的渲染条件，
 *   那是越界改动。所以条目在这里声明 —— 但它是**声明式**的：没有 location.hash 赋值、
 *   没有手工高亮、没有点击拦截、没有"换路由要整套重建"的记账（见下）。
 *
 * 相对 L4 的三处简化：
 *   1. 跳转走 `routerLink`，不再 `location.hash = ...` 再 `preventDefault()`；
 *   2. 高亮走 `routerLinkActive` 语义（这里用 isActive() 直接判，语义等价、更易读），
 *      不再由 click 处理器"乐观地点亮"再靠 MutationObserver 纠正；
 *   3. 条目集合由 `computed` 从当前 URL 派生，`@for` 自动增删 —— 不再需要 L4 的
 *      `data-set` 比对 + 手工 removeChild/重建（v6 的"设置→工具看到残留条目"就是那套的 bug）。
 *
 * 显示/隐藏完全交给 CSS（J 段用 `@media (max-width: 768px)`），组件不做视口判断：
 * 旋转屏幕时由浏览器直接接管，不经过变更检测，也就不会闪。
 */
@Component({
  selector: "app-mobile-sub-nav",
  templateUrl: "./mobile-sub-nav.component.html",
  imports: [RouterModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MobileSubNavComponent {
  private readonly router = inject(Router);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /**
   * 两套二级导航（与 L4 的 NAV_SETS 一一对应：tools 3 项、settings 5 项）。
   * 设置里的「订阅 / 免费家庭版」两项上游是按订阅状态条件渲染的，自托管没有订阅，
   * L4 当年就没放，这里保持一致（G5 断言 settings 恰好 5 项）。
   */
  private readonly navSets: SubNavSet[] = [
    {
      prefix: "/tools",
      items: [
        { label: "生成器", route: "/tools/generator" },
        { label: "导入", route: "/tools/import" },
        { label: "导出", route: "/tools/export" },
      ],
    },
    {
      prefix: "/settings",
      items: [
        { label: "我的账户", route: "/settings/account" },
        { label: "安全", route: "/settings/security" },
        { label: "外观", route: "/settings/appearance" },
        { label: "域名规则", route: "/settings/domain-rules" },
        { label: "紧急访问", route: "/settings/emergency-access" },
      ],
    },
  ];

  protected readonly items = computed<SubNavItem[]>(() => {
    const path = this.path();
    return this.navSets.find((s) => this.under(path, s.prefix))?.items ?? [];
  });

  /** 去掉 query / fragment，并用「等值或前缀 + `/`」匹配锚定在分区根上。 */
  private path(): string {
    return this.url().split("?")[0].split("#")[0];
  }

  protected isActive(route: string): boolean {
    return this.under(this.path(), route);
  }

  private under(path: string, prefix: string): boolean {
    return path === prefix || path.startsWith(`${prefix}/`);
  }
}
