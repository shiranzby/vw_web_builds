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
            const nowSec = Math.round(Date.now() / 1000);
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
