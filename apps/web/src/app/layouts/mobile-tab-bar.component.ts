import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { NavigationEnd, Router, RouterModule } from "@angular/router";
import { filter, map, startWith } from "rxjs";

/**
 * 窄屏底部标签栏 —— 迁移自 L4 的 J17（`custom/custom.js` §10）+ G 段（`custom/custom.css`）。
 *
 * 为什么需要它：窄屏下官方侧栏（`bit-side-nav`）被收成一个汉堡浮层，而 L4 随后还要把
 * 整个 `app-vault-header` 也隐藏（I 段）——两者都需要一个**常驻的**主导航入口。
 * 底部标签栏就是那个入口，也是「隐藏 side-nav」的前提（见迁移清单 §3 的 ⚠️）。
 *
 * 挂载点：`web-layout.component.html`（`app-layout` 的外壳，`user-layout` 与
 * `organization-layout` 都用它）。这等价于 L4 的 `document.querySelector("bit-layout")`
 * 守卫 —— 登录页/前端页不用这个外壳，所以标签栏不会出现在那些页面上。
 *
 * 显示/隐藏完全交给 CSS（G 段用 `@media (max-width: 768px)`），组件本身不做视口判断：
 * 这样旋转屏幕 / 拖窗口时由浏览器直接接管，不经过变更检测，也就不会闪。
 */
@Component({
  selector: "app-mobile-tab-bar",
  templateUrl: "mobile-tab-bar.component.html",
  imports: [RouterModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MobileTabBarComponent {
  private readonly router = inject(Router);

  /** 当前 URL（去掉 query / fragment）。用 signal 是为了配合 OnPush 的最小重渲染。 */
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /**
   * 该标签是否处于选中态。
   *
   * 用「等值或前缀 + `/`」匹配，而不是 `startsWith(route)` —— 后者会让 `/settings`
   * 在 `/settingsomething` 上也亮起来（虽然当前没有这种路由，但匹配规则不该依赖它）。
   */
  protected isActive(route: string): boolean {
    const url = this.url().split("?")[0].split("#")[0];
    return url === `/${route}` || url.startsWith(`/${route}/`);
  }
}
