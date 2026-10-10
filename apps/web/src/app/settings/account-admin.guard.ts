import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";

import { AccountAdminService } from "../layouts/account-admin.service";

/**
 * 只有所有者 / 管理者能进「账号管理」页。
 *
 * 为什么需要它：导航里的入口已经按角色隐藏了，但**直接输 URL** 也得有同样的结果 ——
 * 否则普通用户敲 `/settings/account-admin` 会看到一个空壳（接口会 403，但页面本身
 * 不该出现在他的认知里）。
 *
 * 没权限时**静默**回到「我的账户」：这不是出错，只是一个不该存在的入口，弹提示反而
 * 把"这里有个管理页"这件事告诉了他。返回 `UrlTree` 而不是 `router.navigate + false`，
 * 是为了让重定向发生在导航**取消之前**，不产生一次失败的历史记录。
 */
export const accountAdminGuard: CanActivateFn = async () => {
  const adminService = inject(AccountAdminService);
  const router = inject(Router);

  await adminService.ensureLoaded();
  if (adminService.isAdmin()) {
    return true;
  }
  return router.createUrlTree(["/settings/account"]);
};
