import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from "@angular/core";
import { toObservable, toSignal } from "@angular/core/rxjs-interop";
import { catchError, map, of, switchMap } from "rxjs";

import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { TotpService } from "@bitwarden/common/vault/abstractions/totp.service";
import {
  CipherViewLike,
  CipherViewLikeUtils,
} from "@bitwarden/common/vault/utils/cipher-view-like-utils";
import { I18nPipe } from "@bitwarden/ui-common";

/** 剩余秒数低于该值时整体转成"即将过期"配色。 */
const LOW_THRESHOLD_SECONDS = 5;

/** 「已复制」闪烁时长(ms)。 */
const COPIED_FLASH_MS = 700;

/**
 * 下沿那条线中间挖掉的宽度(px)。
 * ⚠️ 必须与 `css/vaultwarden.css` 里 `.warden-totp-clip` 的 `clip-path: 50% ± 10px` 保持一致,
 * 否则线断的位置和"时长换算"(进度条按整条线减去缺口来算)对不上。
 */
const TRACK_GAP = 20;

type TotpBadgeState = {
  /** 码, 已从中间断开(123456 -> "123 456")。 */
  digits: string;
  /** 剩余秒数。 */
  sec: number;
  /** 是否已进入"即将过期"配色。 */
  low: boolean;
  /** 进度条左段宽度(覆盖周期的前一半)。 */
  leftWidth: string;
  /** 进度条右段宽度(缺口之后的那部分)。 */
  rightWidth: string;
};

/**
 * 保险库列表行内的 TOTP 动态码徽章。
 *
 * 与 L4(`custom/custom.js` §6)的差别, 全是"消掉运行期机制"带来的:
 *
 * | 维度 | L4(运行期注入) | 这里 |
 * |---|---|---|
 * | TOTP 算法 | 自写 Base32 / HOTP / TOTP(RFC 4648 / 4226 / 6238, 约 150 行) | 官方 `TotpService`, 底层是 Rust SDK 的 `generate_totp` |
 * | 取密钥 | 运行期拿 KeyService + EncryptService 解密 `login.totp`, 且**跳过组织条目**(`c.key` 要另派生密钥) | `CipherView.login.totp` 本来就是明文, 组织条目也能显示 |
 * | 行 ↔ 条目匹配 | 按"名称 + 用户名"把 DOM 行对上索引, 重名要靠 fallback | 行组件手里就有 `cipher`, 零匹配 |
 * | 进度条宽度 | 量 `offsetWidth` 换算成 px 写内联样式 | 纯 CSS `calc()`, 左右两段 |
 * | 复制 | 手写 `navigator.clipboard` + `execCommand` 兜底 | 官方 `PlatformUtilsService.copyToClipboard` |
 *
 * 刻意保留的一处差异: 点击复制**不做 premium 门禁**。官方
 * `CopyCipherFieldService.copy(..., "totp")` 会先过 `totpAllowed()`, 非会员点下去是静默失败;
 * 而 L4 的语义是"徽章常显、随时可复制", 所以这里只借官方的剪贴板原语。
 *
 * 声明为 standalone: 保险库列表(经 `vault-items.module.ts`)与独立「验证码」页
 * (`vault/totp-page`)都要用它, 后者是路由级组件、不挂在任何 NgModule 的 declarations 里。
 * ⚠️ 模板里的 `| i18n` 因此不再由宿主模块提供 —— 必须自己 import `I18nPipe`,
 *    否则编译期报 NG8004。其它绑定(@if / [class.x] / [style.width] / 事件)都是内置的。
 */
@Component({
  selector: "vault-totp-badge",
  templateUrl: "./totp-badge.component.html",
  imports: [I18nPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VaultTotpBadgeComponent {
  private readonly totpService = inject(TotpService);
  private readonly platformUtilsService = inject(PlatformUtilsService);

  readonly cipher = input.required<CipherViewLike>();

  /** `otpauth://` URI 或裸 base32 —— 已经是明文, 不需要自己解密。 */
  private readonly totpSecret = computed(
    () => CipherViewLikeUtils.getLogin(this.cipher())?.totp || null,
  );

  protected readonly copied = signal(false);

  /**
   * 每秒一帧的 TOTP 流。
   *
   * `catchError` 是必要的: 用户库里可能存着一条格式不合法的 otpauth URI, 官方组件只在
   * 条目详情对话框里出错(影响一个弹窗), 而我们这里跑在**列表的每一行**上 ——
   * 一个未捕获的错误会掀掉整张表。
   */
  protected readonly state = toSignal(
    toObservable(this.totpSecret).pipe(
      switchMap((secret) =>
        secret ? this.totpService.getCode$(secret).pipe(catchError(() => of(null))) : of(null),
      ),
      map((response) => (response ? this.toState(response.code, response.period) : null)),
    ),
    { initialValue: null },
  );

  private toState(code: string, period: number): TotpBadgeState {
    const remain = period - (Math.round(Date.now() / 1000) % period);
    const progress = remain / period;

    return {
      digits: this.group(code),
      sec: remain,
      low: remain <= LOW_THRESHOLD_SECONDS,
      leftWidth: this.fillWidth(Math.min(progress, 0.5)),
      rightWidth: this.fillWidth(Math.max(progress - 0.5, 0)),
    };
  }

  /** 从中间断开, 与官方条目详情页的显示一致。 */
  private group(code: string): string {
    if (code.length <= 4) {
      return code;
    }
    const half = Math.floor(code.length / 2);
    return `${code.slice(0, half)} ${code.slice(half)}`;
  }

  /**
   * 把"剩余比例"换算成进度条宽度。
   *
   * 有效轨道 = 整条线减去中间的缺口, 于是左右两段合起来正好表示一个完整周期:
   * 前一半走左段, 后一半走右段。跨过缺口时右端是连续推进的 —— 不像 L4 那样
   * 需要在越过中点的一瞬间给宽度补 20px。
   */
  private fillWidth(fraction: number): string {
    return `calc(${fraction.toFixed(4)} * (100% - ${TRACK_GAP}px))`;
  }

  protected copy(event: Event): void {
    event.stopPropagation();
    event.preventDefault();

    const code = this.state()?.digits.replace(/\s/g, "");
    if (!code) {
      return;
    }

    this.platformUtilsService.copyToClipboard(code);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), COPIED_FLASH_MS);
  }
}
