import { hasModifierKey } from "@angular/cdk/keycodes";
import {
  afterRenderEffect,
  Component,
  contentChildren,
  DestroyRef,
  HostBinding,
  Input,
  output,
  computed,
  effect,
  inject,
  input,
  Signal,
  model,
  signal,
  viewChild,
} from "@angular/core";
import { ControlValueAccessor, NgControl, ReactiveFormsModule, FormsModule } from "@angular/forms";
import { NgSelectComponent, NgSelectModule } from "@ng-select/ng-select";

import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";

import { BitFormFieldControlDirective } from "../form-field";
import { IconComponent } from "../icon";
import { TypographyDirective } from "../typography/typography.directive";

import { Option } from "./option";
import { OptionComponent } from "./option.component";

// FIXME(https://bitwarden.atlassian.net/browse/CL-764): Migrate to OnPush
// eslint-disable-next-line @angular-eslint/prefer-on-push-component-change-detection
@Component({
  selector: "bit-select",
  templateUrl: "select.component.html",
  hostDirectives: [
    {
      directive: BitFormFieldControlDirective,
      inputs: ["required", "id"],
    },
  ],
  imports: [NgSelectModule, ReactiveFormsModule, FormsModule, TypographyDirective, IconComponent],
  host: {
    class: "tw-block tw-w-full tw-h-full",
    "[id]": "formFieldControl.id()",
    "[attr.required]": "formFieldControl.required() || null",
  },
})
export class SelectComponent<T> implements ControlValueAccessor {
  private readonly i18nService = inject(I18nService);
  private readonly ngControl = inject(NgControl, { optional: true, self: true });
  readonly formFieldControl = inject(BitFormFieldControlDirective);
  readonly labelForId = this.formFieldControl.labelForId;

  readonly select = viewChild.required(NgSelectComponent);

  /** Optional: Options can be provided using an array input or using `bit-option` */
  readonly items = model<Option<T>[] | undefined>();

  readonly placeholder = input(this.i18nService.t("selectPlaceholder"));
  readonly closed = output();

  /**
   * 窄屏标志(断点与 `css/vaultwarden.css` 全部移动端规则一致: 768px)。
   *
   * 窄屏把下拉做成**纯选择器**, 见模板里 `[searchable]` 那行的注释: 用户要的是
   * "点整块就展开、再点整块就收起、全程不弹软键盘", 而这恰好就是 ng-select 在
   * `searchable = false` 时的**原生**行为 —— 它的 `handleMousedown()` 里写着
   * `if (this.searchable()) { this.open(); } else { this.toggle(); }`
   * (见 `node_modules/@ng-select/ng-select/fesm2022/ng-select-ng-select.mjs:2448`)。
   * 也就是说 `searchable` 为真时**再点一次永远只是 open()**, 收不起来。
   * 桌面端保持可搜索不变(那里没有软键盘, 长列表反而更需要输入过滤)。
   */
  private readonly narrowQuery = window.matchMedia("(max-width: 768px)");
  protected readonly narrow = signal(this.narrowQuery.matches);

  /** 转屏 / 拉宽窗口时跟着换档: 窄屏纯选择器 ↔ 宽屏可搜索。 */
  private readonly onNarrowChange = (event: MediaQueryListEvent) => this.narrow.set(event.matches);

  protected readonly selectedValue = signal<T | undefined | null>(undefined);
  readonly selectedOption: Signal<Option<T> | null | undefined> = computed(() =>
    this.findSelectedOption(this.items(), this.selectedValue()),
  );
  protected readonly searchInputId = computed(() => `${this.formFieldControl.id()}-search`);

  private notifyOnChange?: (value?: T | null) => void;
  private notifyOnTouched?: () => void;

  constructor() {
    if (this.ngControl != null) {
      this.ngControl.valueAccessor = this;
    }
    effect(() => this.formFieldControl.labelForId.set(this.searchInputId()));
    effect(() => {
      this.select()
        ?.searchInput()
        .nativeElement.setAttribute(
          "aria-describedby",
          this.formFieldControl.ariaDescribedBy() ?? "",
        );
    });
    afterRenderEffect({
      read: () => {
        const opts = this.options();
        if (opts.length === 0) {
          return;
        }
        this.items.set(
          opts.map((option) => ({
            icon: option.icon(),
            value: option.value(),
            label: option.label(),
            description: option.description(),
            disabled: option.disabled(),
          })),
        );
      },
    });

    this.narrowQuery.addEventListener("change", this.onNarrowChange);

    /* 面板还开着时组件被销毁(例如所在对话框被直接关掉), 监听与盯梢都不能留在外面。 */
    inject(DestroyRef).onDestroy(() => {
      this.detachKeyboardFit?.();
      this.stopGeometryWatch();
      this.narrowQuery.removeEventListener("change", this.onNarrowChange);
    });
  }

  private readonly options = contentChildren(OptionComponent);

  // Usings a separate getter for the HostBinding to get around an unexplained angular error
  @HostBinding("attr.disabled")
  get disabledAttr() {
    return this.disabled || null;
  }
  // TODO: Skipped for signal migration because:
  //  Accessor inputs cannot be migrated as they are too complex.
  // FIXME(https://bitwarden.atlassian.net/browse/CL-903): Migrate to Signals
  // eslint-disable-next-line @angular-eslint/prefer-signals
  @Input()
  get disabled() {
    return this._disabled ?? this.ngControl?.disabled ?? false;
  }
  set disabled(value: any) {
    this._disabled = value != null && value !== false;
  }
  private _disabled?: boolean;

  /**Implemented as part of NG_VALUE_ACCESSOR */
  writeValue(obj: T): void {
    this.selectedValue.set(obj);
  }

  /**Implemented as part of NG_VALUE_ACCESSOR */
  registerOnChange(fn: (value?: T | null) => void): void {
    this.notifyOnChange = fn;
  }

  /**Implemented as part of NG_VALUE_ACCESSOR */
  registerOnTouched(fn: any): void {
    this.notifyOnTouched = fn;
  }

  /**Implemented as part of NG_VALUE_ACCESSOR */
  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  /**Implemented as part of NG_VALUE_ACCESSOR */
  protected onChange(option: Option<T> | null) {
    this.selectedValue.set(option?.value);

    if (!this.notifyOnChange) {
      return;
    }

    this.notifyOnChange(option?.value);
  }

  /**Implemented as part of NG_VALUE_ACCESSOR */
  protected onBlur() {
    if (!this.notifyOnTouched) {
      return;
    }

    this.notifyOnTouched();
  }

  private findSelectedOption(
    items: Option<T>[] | undefined,
    value: T | null | undefined,
  ): Option<T> | undefined {
    return items?.find((item) => item.value === value);
  }

  /**
   * 窄屏上让下拉面板躲开软键盘。
   *
   * **为什么需要**: 面板是 `appendTo="body"` 的, ng-select 按**布局视口**算它的 top/left;
   * 软键盘弹出时布局视口不变, 于是面板会被键盘盖住 —— 而 `visualViewport.height` 会随之缩小,
   * 所以"键盘之上那块可见区"是可测量的。这里只做一件事: 按可见区把面板重算一次。
   *
   * **为什么不碰表单控件**: 该定制的早期版本曾往应用自己的表单控件上写 `readonly`/`inputmode`,
   * 结果干扰了焦点与必填校验(用户会先看到"必须输入内容。"、点第二次才展开), 已全部撤掉。
   * **不要**写别人拥有的表单控件的状态属性。
   *
   * **为什么放在 `bit-select`**: 它是全应用唯一包装 ng-select 的组件 —— 一处生效, 无需逐处适配。
   *
   * 与 `css/vaultwarden.css` 的 M 段配合: 那里给"往下弹"的面板留了 `46vh` 的兜底上限
   * (桌面端 / 这里未接管时生效); 接管后由下面的行内 `maxHeight` 覆盖它
   * —— 只有非 `!important` 规则才会被行内样式覆盖, M 段刻意没写 `!important`。
   *
   * ⚠️⚠️ 光写行内样式**挡不住** ng-select 的重写, 必须配合 `watchGeometry()`:
   *    见 `applyGeometry()` 上方那段说明(写 `!important` 也没用)。
   */
  private fitPanelToKeyboard = (): void => {
    /* 面板挂在 <body> 下(appendTo), 但 id 就是 ng-select 公开的 dropdownId ⇒ 标准 DOM 取即可。
       不要用 `document.querySelector(".ng-dropdown-panel")`: 那是"全局猜哪个面板",
       同一时刻若有两个面板存在就会改错对象。 */
    const panel = document.getElementById(this.select().dropdownId);

    /* 断点与 F/G/M 段一致(768px); 桌面没有软键盘, 保持 ng-select 原生定位。
       ⚠️ 交还前必须先把我们写过的几何**清掉**并停止盯梢 —— 否则从窄屏转过宽屏
       (横屏 / 拉宽窗口)时, 上一次留下的 `position: fixed; top: …` 会一直生效,
       桌面端的面板再也回不到 ng-select 的原生定位。 */
    if (window.matchMedia("(min-width: 769px)").matches) {
      this.stopGeometryWatch();
      if (panel) {
        this.clearGeometry(panel);
      }
      return;
    }

    if (!panel) {
      return;
    }

    this.applyGeometry(panel);
    this.watchGeometry(panel);
  };

  /**
   * 按"键盘之上的可见区"重算面板几何并写上去。
   *
   * ⚠️ **必须配合 `watchGeometry()` 一起用, 单独调用会被 ng-select 覆盖掉。**
   *
   * 为什么"写 `!important`"这条常规解法在这里不成立: `CSSStyleDeclaration.top = "518px"`
   * (ng-select 的 `_updateYPosition()` 就是这么做) **是替换整个声明**, 会把优先级一起清成
   * 普通 —— 实测滚动后行内值从 `top: 8px !important` 直接变成 `top: 518px`(priority 空)。
   * 也就是说 `!important` 只挡得住**别的样式表规则**, 挡不住**后写的 CSSOM 赋值**。
   *
   * 那为什么非挡不可: ng-select 在 `_handleWindowScroll()` 里监听 `document` 上的
   * `scroll`(capture, 所以**抽屉里那个滚动区**的滚动也算), 然后按
   * `containerRect.bottom - body.getBoundingClientRect().top` 算 `top` —— 那是**文档坐标**,
   * 只对 `position: absolute` 成立; 我们为了躲开软键盘把面板改成了 `position: fixed`
   * (视口坐标)。于是"点开 → 软键盘弹起 → 页面为把输入框顶进可见区而滚动"这一下,
   * 它会把我们刚放到**输入框上方**的面板又甩回**下方**(实测 security-keys 页那一跳是
   * 585px / 508px), 正好塞到键盘后面 —— 用户看到的就是"点下箭头没反应, 只能输入"。
   */
  private applyGeometry(panel: HTMLElement): void {
    const GAP = 6;
    const PAD = 8;
    const MIN = 96;

    const vv = window.visualViewport;
    const visTop = vv?.offsetTop ?? 0;
    const visH = vv?.height ?? window.innerHeight;
    const visBottom = visTop + visH;

    const r = this.select().element.getBoundingClientRect();
    /* 底栏固定钉在视口底部, 会占掉那一带 —— 可用高度按它扣掉, 面板就落不到底栏上。
       为什么不用 z-index 解决: 见 `tabbarInset()` 的注释。 */
    const usableBottom = visBottom - this.tabbarInset();
    const below = usableBottom - r.bottom - GAP - PAD;
    const above = r.top - visTop - GAP - PAD;
    const up = above > below;
    const avail = Math.round(Math.min(Math.max(up ? above : below, MIN), visH - 2 * PAD));

    /* ⚠️ 只用 top, 不用 bottom —— `position: fixed` 的 bottom 参照的是**布局视口**,
       键盘弹起时布局视口不变, 用 bottom 会正好把面板放到键盘后面。 */
    const top = Math.max(
      visTop + PAD,
      Math.min(
        up ? Math.round(r.top) - GAP - avail : Math.round(r.bottom) + GAP,
        usableBottom - PAD - avail,
      ),
    );

    panel.style.position = "fixed";
    panel.style.left = `${Math.round(r.left)}px`;
    panel.style.right = "auto";
    panel.style.width = `${Math.round(r.width)}px`;
    panel.style.top = `${top}px`;
    panel.style.bottom = "auto";
    panel.style.maxHeight = `${avail}px`;

    const items = panel.querySelector<HTMLElement>(".ng-dropdown-panel-items");
    if (items) {
      items.style.maxHeight = `${Math.max(60, avail - 4)}px`;
    }
  }

  /**
   * 底部标签栏在视口底部占掉的高度(px); 没有底栏时是 0。
   *
   * **为什么"把底栏 z-index 抬到面板之上"这条常规解法不行**: 面板的 z-index 由
   * `css/vaultwarden.css` 的 M 段钉在 `2400 !important`(那是为了压过 cdk 浮层的
   * 2050 上下), 底栏要盖住面板就得 > 2400 —— 于是**所有对话框也会被底栏盖掉**,
   * 那是比"面板压住底栏"严重得多的回退。
   *
   * 所以这里改成**几何避让**: 量出底栏实际高度, 从"向下展开"的可用空间里扣掉,
   * 面板自然就停在了底栏上方。往上展开的那一支不需要扣(底栏在下面)。
   */
  private tabbarInset(): number {
    const tabbar = document.getElementById("warden-tabbar");
    return tabbar ? Math.round(tabbar.getBoundingClientRect().height) : 0;
  }

  /**
   * 盯住面板的 `style` 属性: 谁改都由我们**改回来**。
   *
   * 这是上面 `applyGeometry()` 唯一可靠的搭档 —— 我们自己的 `document` scroll 监听是同步跑的,
   * 而 ng-select 那一下走的是 `auditTime(0, …)`(延后到调度器), 所以"比谁后写"必输;
   * 只有"它写一次、我们纠一次"这种事件驱动的方式才是稳的。
   *
   * 防死循环: 回调里**先 `disconnect()` 再写、写完再 `observe()`** —— 写入过程不在观察期内,
   * 不会再触发回调。(面板里的 `<div class="ng-dropdown-panel-items">` 是子节点, 而这里
   * 只观察面板自身且不开 `subtree`, 所以那条 `maxHeight` 也不会反过来触发。)
   */
  private watchGeometry(panel: HTMLElement): void {
    if (this.observedPanel === panel) {
      return;
    }
    this.stopGeometryWatch();

    this.geometryObserver = new MutationObserver(() => {
      this.geometryObserver?.disconnect();
      try {
        this.applyGeometry(panel);
      } finally {
        this.geometryObserver?.observe(panel, { attributes: true, attributeFilter: ["style"] });
      }
    });
    this.geometryObserver.observe(panel, { attributes: true, attributeFilter: ["style"] });
    this.observedPanel = panel;
  }

  private stopGeometryWatch(): void {
    this.geometryObserver?.disconnect();
    this.geometryObserver = undefined;
    this.observedPanel = undefined;
  }

  private geometryObserver?: MutationObserver;
  private observedPanel?: HTMLElement;

  /** `applyGeometry()` 写过的那几个属性(转屏 / 拉宽时要把它们还回去)。 */
  private clearGeometry(panel: HTMLElement): void {
    for (const property of ["position", "left", "right", "width", "top", "bottom", "max-height"]) {
      panel.style.removeProperty(property);
    }
    const items = panel.querySelector<HTMLElement>(".ng-dropdown-panel-items");
    items?.style.removeProperty("max-height");
  }

  /** 面板打开时接管定位; 键盘弹起/收起、以及可见区平移都会触发上面那个重算。 */
  protected onOpen() {
    if (this.detachKeyboardFit != null) {
      return;
    }

    /* ng-select 是在 open 之后的变更检测里才把面板插进 DOM 的, 所以先补一帧;
       真正"键盘弹起"那一下由下面的 resize 兜住。 */
    requestAnimationFrame(this.fitPanelToKeyboard);

    /* ⚠️ `document` 上的 scroll 是**必须**的, 不是锦上添花: ng-select 就在那里重写面板的
       `top`, 我们得跟着把几何重算一次, 面板才会跟着输入框走。
       必须 `capture: true` —— `scroll` 不冒泡, 只有捕获阶段才收得到抽屉里那个滚动区的滚动。 */
    document.addEventListener("scroll", this.fitPanelToKeyboard, {
      capture: true,
      passive: true,
    });

    const vv = window.visualViewport;
    vv?.addEventListener("resize", this.fitPanelToKeyboard);
    vv?.addEventListener("scroll", this.fitPanelToKeyboard);

    this.detachKeyboardFit = () => {
      document.removeEventListener("scroll", this.fitPanelToKeyboard, { capture: true });
      vv?.removeEventListener("resize", this.fitPanelToKeyboard);
      vv?.removeEventListener("scroll", this.fitPanelToKeyboard);
      this.detachKeyboardFit = undefined;
    };
  }

  private detachKeyboardFit?: () => void;

  /**Emits the closed event. */
  protected onClose() {
    this.detachKeyboardFit?.();
    this.stopGeometryWatch();
    this.closed.emit();
  }

  /**
   * 自托管定制(第十六批/T 段): 「按控件即展开/收起」—— 由**我们**在 pointerdown 里做。
   *
   * ---------------------------------------------------------------------------
   * 1) 为什么自己接 pointerdown, 不靠 ng-select 的 `(mousedown)`:
   *    ng-select 的 `handleMousedown()` 是 `if (searchable()) { open() } else { toggle() }`。
   *    窄屏我们把 `searchable` 取假, 于是"点整块容器 toggle"在**桌面浏览器**里确实成立;
   *    但那条路要求浏览器把一次触摸**合成出 mousedown**(`touchstart → touchend →
   *    合成 mousedown/mouseup/click`)。第十四批就是在真机上踩到这一串中间被吞
   *    ("点箭头没反应, 必须先在输入框里敲一个字符面板才出来")。`pointerdown` 是按下
   *    瞬间直接派发的指针事件, 不依赖合成 ⇒ 可靠得多。
   *
   * 2) 为什么挂在**包装 div** 上, 而不是像第十四批那样在外面并排放一个兄弟按钮:
   *    ng-select 判"外部点击"只比 `this._select.contains($event.target)`, 而它自己的
   *    模板里绑着 `(outsideClick)="close()"`(见 ng-select 的 `<ng-dropdown-panel …>`)
   *    ⇒ 按兄弟节点必然被判成"点了外面": "开一次 + 关一次" = 面板只在方框下面闪一层
   *    就没了(用户第十六批报的正是这个现象)。挂在包装 div 上时, 事件**目标**仍是
   *    `<ng-select>` 内部的元素 ⇒ 永不触发 outsideClick, 而事件照样冒泡到包装 div。
   *
   * 3) `preventDefault()` 是必须的: 规范里"pointerdown 被取消 ⇒ 不再补发兼容 mouse
   *    事件(mousedown/mouseup/click)"。所以一次按下只 toggle 一次, 也不会再让
   *    ng-select 自己的 `handleMousedown()` 二次 toggle; 同理那次按下也不会被
   *    `outsideClickEvent="mousedown"` 的 document 监听收到 ⇒ 不会"开一次立刻关一次"。
   *    窄屏输入框是 readOnly, 不需要焦点 ⇒ 掐掉鼠标事件没有副作用。
   *
   * 4) 只接管**窄屏**。宽屏 `searchable = true`, 原生逻辑有两处细节不能碰:
   *    · 点输入框要能落光标 / 选中文本 —— 掐掉 mousedown 会一起掐掉焦点与选区;
   *    · `.ng-arrow-wrapper` 命中区宽 25px 而可见三角只有 ~10px, 两侧那 15px 的原生
   *      行为是 `handleArrowClick()`(开↔关)。我们若在 pointerdown 里先 `open()`,
   *      紧接着原生 mousedown 就会走 `handleArrowClick()` 看到"已开"⇒ `close()`,
   *      面板反而闪一下 —— 正是要修掉的那类症状。所以宽屏一律不干预。
   *
   * ⚠️ 只接管"按在控件本体上"的那一下: 面板是 `appendTo="body"`, 点选项时事件根本不
   *    经过这个包装 div, 所以那条 `contains()` 判定是防御性的, 别删。
   */
  protected onFieldPointerdown(event: PointerEvent): void {
    if (!this.narrow() || this.disabled) {
      return;
    }

    if (!this.select().element.contains(event.target as Node)) {
      return;
    }

    event.preventDefault();
    this.select().toggle();
  }

  /**
   * Prevent Escape key press from propagating to parent components
   * (for example, parent dialog should not close when Escape is pressed in the select)
   *
   * @returns true to keep default key behavior; false to prevent default key behavior
   *
   * Needs to be arrow function to retain `this` scope.
   */
  protected onKeyDown = (event: KeyboardEvent) => {
    if (this.select().isOpen() && event.key === "Escape" && !hasModifierKey(event)) {
      event.stopPropagation();
    }

    return true;
  };
}
