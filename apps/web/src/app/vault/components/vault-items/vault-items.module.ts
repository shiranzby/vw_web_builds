import { ScrollingModule } from "@angular/cdk/scrolling";
import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { RouterModule } from "@angular/router";

import { PremiumBadgeComponent } from "@bitwarden/angular/billing/components/premium-badge";
import {
  ScrollLayoutDirective,
  TableModule,
  TooltipDirective,
  IconModule,
} from "@bitwarden/components";
import {
  CopyCipherFieldDirective,
  NewCipherMenuComponent,
  VaultItemCopyActionsComponent,
  Vfo1I18nPipe,
  Vfo1IconPipe,
} from "@bitwarden/vault";

import { CollectionNameBadgeComponent } from "../../../admin-console/organizations/collections";
import { GroupBadgeModule } from "../../../admin-console/organizations/collections/group-badge/group-badge.module";
import { SharedModule } from "../../../shared/shared.module";
import { OrganizationBadgeModule } from "../../individual-vault/organization-badge/organization-badge.module";
import { PipesModule } from "../../individual-vault/pipes/pipes.module";
import { CoachmarkComponent } from "../coachmark";

import { VaultTotpBadgeComponent } from "./totp-badge.component";
import { VaultCipherRowComponent } from "./vault-cipher-row.component";
import { VaultCollectionRowComponent } from "./vault-collection-row.component";
import { VaultItemsComponent } from "./vault-items.component";

@NgModule({
  imports: [
    CommonModule,
    RouterModule,
    ScrollingModule,
    SharedModule,
    TableModule,
    TooltipDirective,
    OrganizationBadgeModule,
    CollectionNameBadgeComponent,
    GroupBadgeModule,
    PipesModule,
    CopyCipherFieldDirective,
    VaultItemCopyActionsComponent,
    ScrollLayoutDirective,
    PremiumBadgeComponent,
    IconModule,
    Vfo1I18nPipe,
    Vfo1IconPipe,
    // 自托管定制(第十批/N 段): 窄屏「新增」菜单 + 它的 coachmark 弹层(见 vault-items.component.html)
    NewCipherMenuComponent,
    CoachmarkComponent,
    // standalone, 不参与本模块的 declarations —— 见 totp-badge.component.ts 头部注释
    VaultTotpBadgeComponent,
  ],
  declarations: [VaultItemsComponent, VaultCipherRowComponent, VaultCollectionRowComponent],
  exports: [VaultItemsComponent],
})
export class VaultItemsModule {}
