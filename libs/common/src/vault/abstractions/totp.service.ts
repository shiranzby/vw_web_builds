import { Observable } from "rxjs";

import { TotpResponse } from "@bitwarden/sdk-internal";

/** 一次取样里的"当前码 + 下一码", 见 `TotpService.getCodes$`。 */
export type TotpCodes = {
  /** 当前窗口的码。 */
  code: string;
  /** 当前窗口**还剩**多少秒(取值 1..period)。 */
  sec: number;
  /** 周期(秒)。进度条宽度就是由它和 `sec` 换算出来的。 */
  period: number;
  /** 下一个窗口的码; 不在"即将过期"窗口内时是 `null`(那时不去算它)。 */
  nextCode: string | null;
};

export abstract class TotpService {
  /**
   * Gets an observable that emits TOTP codes at regular intervals
   * @param key - Can be:
   *  - A base32 encoded string
   *  - OTP Auth URI
   *  - Steam URI
   * @returns Observable that emits TotpResponse containing the code and period
   */
  abstract getCode$(key: string): Observable<TotpResponse>;

  /**
   * 当前码 + 下一码(同上, 但一次给两个)。
   *
   * **为什么要单独一条**: 保险库列表里**每一行**都会跑一次, 无条件多算一个码就等于把
   * WASM 调用翻倍。所以只在小窗口内(剩余 ≤ `nextWithinSec`)才去算下一码 ——
   * 稳态开销与 `getCode$` 完全一致, 只有最后那几秒每行多一次。
   *
   * @param key - 同 `getCode$`
   * @param nextWithinSec - 剩余秒数 ≤ 该值时才填 `nextCode`
   */
  abstract getCodes$(key: string, nextWithinSec: number): Observable<TotpCodes>;
}
