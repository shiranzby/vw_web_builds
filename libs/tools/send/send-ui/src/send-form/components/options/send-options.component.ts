// FIXME: Update this file to be type safe and remove this and next line
// @ts-strict-ignore
import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from "@angular/core";
import { takeUntilDestroyed, toSignal } from "@angular/core/rxjs-interop";
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from "@angular/forms";

import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import {
  TypographyModule,
  AsyncActionsModule,
  ButtonModule,
  CardComponent,
  CheckboxModule,
  DisclosureComponent,
  DisclosureTriggerForDirective,
  FormFieldModule,
  IconButtonModule,
  IconModule,
  SectionComponent,
  SectionHeaderComponent,
  SelectModule,
} from "@bitwarden/components";
import { I18nPipe } from "@bitwarden/ui-common";

import { SendPolicyService } from "../../..";
import { SendFormService } from "../../abstractions/send-form.service";

@Component({
  selector: "tools-send-options",
  templateUrl: "./send-options.component.html",
  standalone: true,
  imports: [
    AsyncActionsModule,
    ButtonModule,
    CardComponent,
    CheckboxModule,
    CommonModule,
    DisclosureComponent,
    DisclosureTriggerForDirective,
    FormFieldModule,
    IconButtonModule,
    IconModule,
    I18nPipe,
    ReactiveFormsModule,
    SectionComponent,
    SectionHeaderComponent,
    SelectModule,
    TypographyModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SendOptionsComponent {
  protected readonly sendFormService = inject(SendFormService);
  private readonly sendPolicyService = inject(SendPolicyService);
  private readonly i18nService = inject(I18nService);

  readonly editing = input<boolean>(false);

  readonly sendOptionsForm = new FormGroup({
    maxAccessCount: new FormControl<string>(
      this.sendFormService.updatedSendView()?.maxAccessCount?.toString() ?? "",
      [this.isIntegerValidator(), Validators.min(1)],
    ),
    accessCount: new FormControl(this.sendFormService.updatedSendView()?.accessCount ?? null),
    notes: new FormControl(this.sendFormService.updatedSendView()?.notes ?? null),
    hideEmail: new FormControl(this.sendFormService.updatedSendView()?.hideEmail ?? null),
  });

  readonly anyOptionFieldVisible = computed(
    () => this.maxAccessCountVisible() || this.hideEmailVisible() || this.privateNoteVisible(),
  );

  readonly maxAccessCountVisible = computed(
    () => this.editing() || this.sendFormService.originalSendView()?.maxAccessCount != null,
  );

  get shouldShowCount(): boolean {
    return (
      this.sendFormService.sendFormConfig.mode === "edit" &&
      this.sendOptionsForm.value.maxAccessCount !== null
    );
  }

  readonly showAccessCount = computed(
    () => this.sendFormService.originalSendView()?.maxAccessCount != null,
  );

  readonly viewsLeft = computed(() => {
    const maxAccessCount = this.sendFormService.originalSendView()?.maxAccessCount ?? 0;
    const accessCount = this.sendFormService.originalSendView()?.accessCount ?? 0;
    return (maxAccessCount - accessCount).toString();
  });

  private readonly _hideEmailDisabledByPolicy = toSignal(this.sendPolicyService.disableHideEmail$);
  readonly hideEmailVisible = computed(
    () =>
      !this._hideEmailDisabledByPolicy() &&
      (this.editing() || this.sendFormService.originalSendView()?.hideEmail),
  );

  readonly hideEmailDisabled = computed(() => !this.editing());

  readonly privateNoteVisible = computed(
    () => this.editing() || this.sendFormService.originalSendView()?.notes?.length > 0,
  );

  constructor() {
    this.sendFormService.registerChildForm("sendOptionsForm", this.sendOptionsForm);

    effect(() => {
      if (!this.editing() && this.sendFormService.originalSendView()) {
        this.sendOptionsForm.patchValue({
          maxAccessCount: this.sendFormService.originalSendView()?.maxAccessCount?.toString() ?? "",
          accessCount: this.sendFormService.originalSendView()?.accessCount,
          hideEmail: this.sendFormService.originalSendView()?.hideEmail,
          notes: this.sendFormService.originalSendView()?.notes,
        });
      }
    });

    effect(() => {
      if (this.hideEmailDisabled()) {
        this.sendOptionsForm.get("hideEmail").disable({ emitEvent: false });
      } else {
        this.sendOptionsForm.get("hideEmail").enable({ emitEvent: false });
      }
    });

    this.sendOptionsForm.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      const value = this.sendOptionsForm.getRawValue();
      this.sendFormService.patchSend((send) => {
        return Object.assign(send, {
          maxAccessCount:
            value.maxAccessCount == null || value.maxAccessCount === ""
              ? null
              : Number(value.maxAccessCount),
          accessCount: value.accessCount,
          hideEmail: value.hideEmail,
          notes: value.notes,
        });
      });
    });
  }

  isIntegerValidator(): ValidatorFn {
    return (control: FormControl): ValidationErrors | null => {
      if (control.value == null || control.value == "") {
        return null;
      }
      const numVal = Number.parseFloat(control.value);
      if (isNaN(numVal)) {
        return { numberValidation: { message: this.i18nService.t("numericInputError") } };
      }
      const intVal = Number.parseInt(control.value);
      if (numVal !== intVal) {
        return { numberValidation: { message: this.i18nService.t("integerInputError") } };
      }
      return null;
    };
  }

  /**
   * 空值时的占位文案(第十七批/U 段, 用户要求"默认 placeholder 不填为不限制")。
   * 只在字段为空时由浏览器显示, 所以不需要额外判空。
   */
  get maxAccessCountPlaceholder(): string {
    return this.i18nService.t("wardenUnlimited");
  }

  /**
   * 最大访问次数步进(第十七批/U 段, 用户要求"最右边可以给个 - + 的按钮")。
   *
   * 让 `−` 成为 `+` 的**逆运算**(一个可来回的阶梯):
   *   … ↔ 3 ↔ 2 ↔ 1 ↔ **空(= 不限制)**
   * 所以 `1` 再按一次 `−` 会回到"不限制"(空), 而不是卡在 1 —— 用户特别强调
   * "默认不填为不限制", 卡在 1 的话手机上想恢复默认还得手动清空输入框。
   * 空值继续按 `−` 仍是空(已经下界了)。
   *
   * `maxAccessCount` 这个控件存的是**字符串**(见它的声明), 空值用 `""` 而不是 `null`,
   * 与 `valueChanges` 里 `value === "" ? null : Number(value)` 的约定保持一致。
   */
  stepMaxAccessCount(delta: number): void {
    const control = this.sendOptionsForm.get("maxAccessCount");
    const raw = control.value;
    const current = raw == null || raw === "" ? null : Number.parseInt(raw as string, 10);

    let next: number | null;
    if (current == null) {
      next = delta > 0 ? 1 : null;
    } else {
      const stepped = current + delta;
      next = stepped < 1 ? null : stepped;
    }

    control.setValue(next == null ? "" : next.toString());
    control.markAsDirty();
  }
}
