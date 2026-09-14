import { Observable, map, shareReplay, switchMap, timer } from "rxjs";

import { TotpResponse } from "@bitwarden/sdk-internal";

import { SdkService } from "../../platform/abstractions/sdk/sdk.service";
import { TotpCodes, TotpService as TotpServiceAbstraction } from "../abstractions/totp.service";

/**
 * Represents TOTP information including display formatting and timing
 */
export type TotpInfo = {
  /** The TOTP code value */
  totpCode: string;

  /** The TOTP code value formatted for display, includes spaces */
  totpCodeFormatted: string;

  /** Progress bar percentage value */
  totpDash: number;

  /** Seconds remaining until the TOTP code changes */
  totpSec: number;

  /** Indicates when the code is close to expiring */
  totpLow: boolean;
};

export class TotpService implements TotpServiceAbstraction {
  constructor(private sdkService: SdkService) {}

  getCode$(key: string): Observable<TotpResponse> {
    return timer(0, 1000).pipe(
      switchMap(() =>
        this.sdkService.client$.pipe(
          map((sdk) => {
            return sdk.vault().totp().generate_totp(key);
          }),
        ),
      ),
      shareReplay({ refCount: true, bufferSize: 1 }),
    );
  }

  getCodes$(key: string, nextWithinSec: number): Observable<TotpCodes> {
    return timer(0, 1000).pipe(
      switchMap(() =>
        this.sdkService.client$.pipe(
          map((sdk) => {
            const totp = sdk.vault().totp();
            const current = totp.generate_totp(key);
            /* ⚠️ 必须 `floor`, 不能 `round`(第十六批修正 —— 这条曾让用户看到"换码那一瞬间
               主码还是旧码, 然后闪一下才变成新码"):
               `Math.round(Date.now()/1000)` 会在窗口边界**前最多 0.5 秒**就跨过边界 ⇒ `sec`
               提前跳成 `period`(表现: 进度条提早归零重跑、次码提早消失), 而此刻 SDK 刚算出的
               `code` 仍属于**旧**窗口 ⇒ 一次取样内部自相矛盾(`sec === period` 却 `code` 是旧码)。
               实测: `.deploycheck/probe-b16-totp-frames.mjs` 把升格动画放慢 10 倍逐帧截图,
               拍到徽章上下两行**都是旧码**、而底部进度条已经归零到 "30"。
               `floor` 与 TOTP 窗口的定义 `floor(now / period)` 一致 ⇒ `sec` 与 `code` 永远属于
               同一窗口。取值仍是 1..period(`nowSec % period === 0` 时给 `period`, 不会给 0)。 */
            const nowSec = Math.floor(Date.now() / 1000);
            const sec = current.period - (nowSec % current.period);

            if (sec > nextWithinSec) {
              return { code: current.code, sec, period: current.period, nextCode: null };
            }

            /* `generate_totp(key, time_ms?)` **自带时间戳参数** —— 把时间推进到下一个
               窗口的开头就得到"下一代码", 不需要自己实现 Base32/HMAC/RFC 6238
               (L4 当年写了约 150 行, 而且拿不到 SDK 对 Steam / otpauth URI 的特例处理)。 */
            const nextStart = (Math.floor(nowSec / current.period) + 1) * current.period;
            const next = totp.generate_totp(key, nextStart * 1000);

            return { code: current.code, sec, period: current.period, nextCode: next.code };
          }),
        ),
      ),
      shareReplay({ refCount: true, bufferSize: 1 }),
    );
  }
}
