import { Component, OnInit, OnDestroy, signal } from "@angular/core";
import { firstValueFrom, lastValueFrom, map, Observable, Subject, takeUntil } from "rxjs";

import { AccountDeletionService } from "@bitwarden/angular/auth/account-deletion/account-deletion.service";
import { UserDecryptionOptionsServiceAbstraction } from "@bitwarden/auth/common";
import { OrganizationService } from "@bitwarden/common/admin-console/abstractions/organization/organization.service.abstraction";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { getUserId } from "@bitwarden/common/auth/services/account.service";
import { DialogService } from "@bitwarden/components";

import { HeaderModule } from "../../../layouts/header/header.module";
import { SharedModule } from "../../../shared";
import { PurgeVaultComponent } from "../../../vault/settings/purge-vault.component";

import { ChangeEmailComponent } from "./change-email.component";
import { DangerZoneComponent } from "./danger-zone.component";
import { DeauthorizeSessionsComponent } from "./deauthorize-sessions.component";
import { ProfileComponent } from "./profile.component";
import { SetAccountVerifyDevicesDialogComponent } from "./set-account-verify-devices-dialog.component";

// FIXME(https://bitwarden.atlassian.net/browse/CL-764): Migrate to OnPush
// eslint-disable-next-line @angular-eslint/prefer-on-push-component-change-detection
@Component({
  templateUrl: "account.component.html",
  imports: [
    SharedModule,
    HeaderModule,
    ProfileComponent,
    ChangeEmailComponent,
    DangerZoneComponent,
  ],
})
export class AccountComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  showChangeEmail$: Observable<boolean> = new Observable();
  showPurgeVault$: Observable<boolean> = new Observable();
  showDeleteAccount$: Observable<boolean> = new Observable();
  verifyNewDeviceLogin: boolean = true;

  /**
   * 自托管定制(第十一批/O 段): 窄屏「更改电子邮箱」那块是否已展开。
   * 由「电子邮箱」行右侧的入口按钮打开、由那块里的「取消」收起。
   * 宽屏不用它 —— 宽屏那一块照官方常显(见 account.component.html 的注释)。
   */
  protected readonly changeEmailExpanded = signal(false);

  constructor(
    private accountService: AccountService,
    private dialogService: DialogService,
    private userDecryptionOptionsService: UserDecryptionOptionsServiceAbstraction,
    private organizationService: OrganizationService,
    private accountDeletionService: AccountDeletionService,
  ) {}

  async ngOnInit() {
    const userId = await firstValueFrom(getUserId(this.accountService.activeAccount$));

    const userIsClaimedByOrganization$ = this.organizationService
      .organizations$(userId)
      .pipe(
        map((organizations) => organizations.some((o) => o.userIsClaimedByOrganization === true)),
      );

    const hasMasterPassword$ = this.userDecryptionOptionsService.hasMasterPasswordById$(userId);

    this.showChangeEmail$ = hasMasterPassword$;

    this.showPurgeVault$ = userIsClaimedByOrganization$.pipe(
      map((userIsClaimedByOrganization) => !userIsClaimedByOrganization),
    );

    this.showDeleteAccount$ = userIsClaimedByOrganization$.pipe(
      map((userIsClaimedByOrganization) => !userIsClaimedByOrganization),
    );

    this.accountService.accountVerifyNewDeviceLogin$
      .pipe(takeUntil(this.destroy$))
      .subscribe((verifyDevices) => {
        this.verifyNewDeviceLogin = verifyDevices;
      });
  }

  deauthorizeSessions = async () => {
    const dialogRef = DeauthorizeSessionsComponent.open(this.dialogService);
    await lastValueFrom(dialogRef.closed);
  };

  purgeVault = async () => {
    const dialogRef = PurgeVaultComponent.open(this.dialogService);
    await lastValueFrom(dialogRef.closed);
  };

  deleteAccount = async () => {
    await this.accountDeletionService.openDeleteAccountFlow();
  };

  setNewDeviceLoginProtection = async () => {
    const dialogRef = SetAccountVerifyDevicesDialogComponent.open(this.dialogService);
    await lastValueFrom(dialogRef.closed);
  };

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
