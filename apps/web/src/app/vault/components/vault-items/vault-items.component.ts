// FIXME: Update this file to be type safe and remove this and next line
// @ts-strict-ignore
import { SelectionModel } from "@angular/cdk/collections";
import { Component, EventEmitter, Input, Output, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  Observable,
  combineLatest,
  distinctUntilChanged,
  map,
  of,
  startWith,
  switchMap,
} from "rxjs";

import {
  CollectionAdminView,
  Unassigned,
  CollectionView,
} from "@bitwarden/common/admin-console/models/collections";
import { Organization } from "@bitwarden/common/admin-console/models/domain/organization";
import { FeatureFlag } from "@bitwarden/common/enums/feature-flag.enum";
import { ConfigService } from "@bitwarden/common/platform/abstractions/config/config.service";
import { CipherType } from "@bitwarden/common/vault/enums";
import { CipherAuthorizationService } from "@bitwarden/common/vault/services/cipher-authorization.service";
import {
  RestrictedCipherType,
  RestrictedItemTypesService,
} from "@bitwarden/common/vault/services/restricted-item-types.service";
import {
  CipherViewLike,
  CipherViewLikeUtils,
} from "@bitwarden/common/vault/utils/cipher-view-like-utils";
import { SortDirection, TableDataSource } from "@bitwarden/components";
import { OrganizationId } from "@bitwarden/sdk-internal";
import {
  compareVaultItems,
  RoutedVaultFilterService,
  VaultBatchBarService,
  VaultItem,
} from "@bitwarden/vault";

import { GroupView } from "../../../admin-console/organizations/core";
import { CoachmarkService } from "../coachmark";

import {
  CollectionPermission,
  convertToPermission,
} from "./../../../admin-console/organizations/shared/components/access-selector/access-selector.models";
import { VaultItemEvent } from "./vault-item-event";

// Fixed manual row height required due to how cdk-virtual-scroll works
export const RowHeight = 76.5;
export const RowHeightClass = `tw-h-[76.5px]`;

const MaxSelectionCount = 500;

type ItemPermission = CollectionPermission | "NoAccess";

// FIXME(https://bitwarden.atlassian.net/browse/CL-764): Migrate to OnPush
// eslint-disable-next-line @angular-eslint/prefer-on-push-component-change-detection
@Component({
  selector: "app-vault-items",
  templateUrl: "vault-items.component.html",
  standalone: false,
})
export class VaultItemsComponent<C extends CipherViewLike> {
  protected RowHeight = RowHeight;

  // FIXME(https://bitwarden.atlassian.net/browse/CL-903): Migrate to Signals
  // eslint-disable-next-line @angular-eslint/prefer-signals
  @Input() disabled: boolean;
  // FIXME(https://bitwarden.atlassian.net/browse/CL-903): Migrate to Signals
  // eslint-disable-next-line @angular-eslint/prefer-signals
  @Input() showOwner: boolean;
  // FIXME(https://bitwarden.atlassian.net/browse/CL-903): Migrate to Signals
  // eslint-disable-next-line @angular-eslint/prefer-signals
  @Input() showCollections: boolean;
  // FIXME(https://bitwarden.atlassian.net/browse/CL-903): Migrate to Signals
  // eslint-disable-next-line @angular-eslint/prefer-signals
  @Input() showGroups: boolean;
  // FIXME(https://bitwarden.atlassian.net/browse/CL-903): Migrate to Signals
  // eslint-disable-next-line @angular-eslint/prefer-signals
  @Input() useEvents: boolean;
  // FIXME(https://bitwarden.atlassian.net/browse/CL-903): Migrate to Signals
  // eslint-disable-next-line @angular-eslint/prefer-signals
  @Input() showPremiumFeatures: boolean;
  // FIXME(https://bitwarden.atlassian.net/browse/CL-903): Migrate to Signals
  // eslint-disable-next-line @angular-eslint/prefer-signals
  @Input() showBulkMove: boolean;
  // FIXME(https://bitwarden.atlassian.net/browse/CL-903): Migrate to Signals
  // eslint-disable-next-line @angular-eslint/prefer-signals
  @Input() showBulkTrashOptions: boolean;
  // Encompasses functionality only available from the organization vault context
  // FIXME(https://bitwarden.atlassian.net/browse/CL-903): Migrate to Signals
  // eslint-disable-next-line @angular-eslint/prefer-signals
  @Input() showAdminActions = false;
  // FIXME(https://bitwarden.atlassian.net/browse/CL-903): Migrate to Signals
  // eslint-disable-next-line @angular-eslint/prefer-signals
  @Input() allOrganizations: Organization[] = [];
  // FIXME(https://bitwarden.atlassian.net/browse/CL-903): Migrate to Signals
  // eslint-disable-next-line @angular-eslint/prefer-signals
  @Input() allCollections: CollectionView[] = [];
  // FIXME(https://bitwarden.atlassian.net/browse/CL-903): Migrate to Signals
  // eslint-disable-next-line @angular-eslint/prefer-signals
  @Input() allGroups: GroupView[] = [];
  // FIXME(https://bitwarden.atlassian.net/browse/CL-903): Migrate to Signals
  // eslint-disable-next-line @angular-eslint/prefer-signals
  @Input() showBulkEditCollectionAccess = false;
  // FIXME(https://bitwarden.atlassian.net/browse/CL-903): Migrate to Signals
  // eslint-disable-next-line @angular-eslint/prefer-signals
  @Input() showBulkAddToCollections = false;
  // FIXME(https://bitwarden.atlassian.net/browse/CL-903): Migrate to Signals
  // eslint-disable-next-line @angular-eslint/prefer-signals
  @Input() showPermissionsColumn = false;
  // FIXME(https://bitwarden.atlassian.net/browse/CL-903): Migrate to Signals
  // eslint-disable-next-line @angular-eslint/prefer-signals
  @Input() viewingOrgVault: boolean;
  // FIXME(https://bitwarden.atlassian.net/browse/CL-903): Migrate to Signals
  // eslint-disable-next-line @angular-eslint/prefer-signals
  @Input() addAccessStatus: number;
  // FIXME(https://bitwarden.atlassian.net/browse/CL-903): Migrate to Signals
  // eslint-disable-next-line @angular-eslint/prefer-signals
  @Input() addAccessToggle: boolean;
  // FIXME(https://bitwarden.atlassian.net/browse/CL-903): Migrate to Signals
  // eslint-disable-next-line @angular-eslint/prefer-signals
  @Input() activeCollection: CollectionView | undefined;
  // FIXME(https://bitwarden.atlassian.net/browse/CL-903): Migrate to Signals
  // eslint-disable-next-line @angular-eslint/prefer-signals
  @Input() userCanArchive: boolean;
  // FIXME(https://bitwarden.atlassian.net/browse/CL-903): Migrate to Signals
  // eslint-disable-next-line @angular-eslint/prefer-signals
  @Input() enforceOrgDataOwnershipPolicy: boolean;

  /*
   * 自托管定制(第十批/N 段). 窄屏下把页头那颗「新增」菜单并进本组件的「名称」表头行
   * (见模板里的 .warden-headbar), 省掉页头独占的一行高度。
   *
   * 这几个权限位/事件都**不在这里重算**, 而是由 vault.component.html 用模板引用变量
   * 从 app-vault-header 上直接透传(那几个 getter 在页头组件上是 public)。这样两处
   * 「能否新建 / 是否被停用」永远是同一个来源, 不会出现两套判断对不上的情况。
   */
  // FIXME(https://bitwarden.atlassian.net/browse/CL-903): Migrate to Signals
  // eslint-disable-next-line @angular-eslint/prefer-signals
  @Input() canCreateCipher = false;
  // FIXME(https://bitwarden.atlassian.net/browse/CL-903): Migrate to Signals
  // eslint-disable-next-line @angular-eslint/prefer-signals
  @Input() canCreateFolder = false;
  // FIXME(https://bitwarden.atlassian.net/browse/CL-903): Migrate to Signals
  // eslint-disable-next-line @angular-eslint/prefer-signals
  @Input() canCreateCollection = false;
  // FIXME(https://bitwarden.atlassian.net/browse/CL-903): Migrate to Signals
  // eslint-disable-next-line @angular-eslint/prefer-signals
  @Input() canCreateSshKey = false;
  /** 组织被停用时置灰菜单 —— 对应页头的 [disabled]="isOrganizationSuspended" */
  // FIXME(https://bitwarden.atlassian.net/browse/CL-903): Migrate to Signals
  // eslint-disable-next-line @angular-eslint/prefer-signals
  @Input() newCipherMenuDisabled = false;
  /** 垃圾篓(trash)里没有「新增」—— 与页头 @if (filter.type !== "trash") 同口径 */
  // FIXME(https://bitwarden.atlassian.net/browse/CL-903): Migrate to Signals
  // eslint-disable-next-line @angular-eslint/prefer-signals
  @Input() showNewCipherMenu = false;

  // FIXME(https://bitwarden.atlassian.net/browse/CL-903): Migrate to Signals
  // eslint-disable-next-line @angular-eslint/prefer-output-emitter-ref
  @Output() cipherAdded = new EventEmitter<CipherType>();
  // FIXME(https://bitwarden.atlassian.net/browse/CL-903): Migrate to Signals
  // eslint-disable-next-line @angular-eslint/prefer-output-emitter-ref
  @Output() folderAdded = new EventEmitter<void>();
  // FIXME(https://bitwarden.atlassian.net/browse/CL-903): Migrate to Signals
  // eslint-disable-next-line @angular-eslint/prefer-output-emitter-ref
  @Output() collectionAdded = new EventEmitter<void>();
  // FIXME(https://bitwarden.atlassian.net/browse/CL-903): Migrate to Signals
  // eslint-disable-next-line @angular-eslint/prefer-output-emitter-ref
  @Output() openAddItemDialog = new EventEmitter<void>();

  private _ciphers?: C[] = [];
  // FIXME(https://bitwarden.atlassian.net/browse/CL-903): Migrate to Signals
  // eslint-disable-next-line @angular-eslint/prefer-signals
  @Input() get ciphers(): C[] {
    return this._ciphers;
  }
  set ciphers(value: C[] | undefined) {
    this._ciphers = value ?? [];
    this.refreshItems();
  }

  private _collections?: CollectionView[] = [];
  // FIXME(https://bitwarden.atlassian.net/browse/CL-903): Migrate to Signals
  // eslint-disable-next-line @angular-eslint/prefer-signals
  @Input() get collections(): CollectionView[] {
    return this._collections;
  }
  set collections(value: CollectionView[] | undefined) {
    this._collections = value ?? [];
    this.refreshItems();
  }

  // FIXME(https://bitwarden.atlassian.net/browse/CL-903): Migrate to Signals
  // eslint-disable-next-line @angular-eslint/prefer-output-emitter-ref
  @Output() onEvent = new EventEmitter<VaultItemEvent<C>>();

  protected readonly batchBarService = inject(VaultBatchBarService, {
    optional: true,
  }) as VaultBatchBarService<C> | null;

  protected editableItems: VaultItem<C>[] = [];
  protected dataSource = new TableDataSource<VaultItem<C>>();
  private readonly _localSelection = new SelectionModel<VaultItem<C>>(
    true,
    [],
    true,
    compareVaultItems,
  );
  get selection(): SelectionModel<VaultItem<C>> {
    return this.batchBarService?.selection ?? this._localSelection;
  }

  /**
   * 自托管定制(J7/J14): 窄屏「选择」胶囊的展开态。
   *
   * 官方 8.0 的底部批量条受 `PM37785_VaultBatchBar` 开关控制, 自托管后端没有开启
   * (线上 `/api/config` 的 featureStates 里没有这一项), 所以这里只负责"放出复选框列
   * + 给表头 ⋯ 让位", 不另建底部操作条 —— 等价 L4 §8 在 v10 之后的形态。
   *
   * 桌面端不使用这个状态: 那里的复选框列本来就常显(见 vaultwarden.css 的 J7 段),
   * 胶囊也不会被渲染出来。
   */
  protected readonly selecting = signal(false);

  protected toggleSelecting(): void {
    const next = !this.selecting();
    this.selecting.set(next);

    if (!next) {
      // 退出选择模式时清空选中项(等价 L4 setSelecting(false) 里的 uncheckAll())
      this.selection.clear();
    }
  }

  protected readonly coachmarkService = inject(CoachmarkService);

  /**
   * 自托管定制(第十批/N 段): 窄屏判定。断点与 vaultwarden.css 的 @media (max-width: 768px) 一致。
   *
   * 窄屏下「新增」从页头搬进本组件的「名称」表头行, 页头那颗由 CSS 藏掉。而 coachmark
   * 的 addItem 步骤是**锚在按钮上**的([bitPopoverAnchorFor]) —— 若两处都挂锚点, 会同时
   * 弹出两个 coachmark, 其中锚到 display:none 按钮的那个会拿到全零 rect、掉到视口左上角。
   * 所以让"当前可见的那颗"挂锚点, 这个 getter 就是那个开关(页头那边是它的取反)。
   *
   * 为什么读 window.innerWidth 就够、不引入响应式断点服务: 这个判定只在弹层"要开"时
   * 需要正确, 而弹层由 activeStepId 信号驱动开合 —— 信号一变必然跟一次变更检测, 这次
   * 变更检测就会重新求值本 getter。且真机上视口本来就不会变。
   */
  protected get isNarrowViewport(): boolean {
    return window.innerWidth <= 768;
  }

  /**
   * 窄屏「新增」的 coachmark 弹层开关。弹层本体是模板里的 #addItemCoachmark
   * (与页头那边同构: 同一个 @if 块内声明 + 引用), 所以这里只需要开合条件。
   */
  protected get addItemCoachmarkOpen(): boolean {
    return (
      this.showNewCipherMenu &&
      this.isNarrowViewport &&
      this.coachmarkService.activeStepId() === "addItem"
    );
  }

  protected canDeleteSelected$: Observable<boolean>;
  protected canRestoreSelected$: Observable<boolean>;
  protected disableMenu$: Observable<boolean>;
  protected showCopyAndLaunchActions$: Observable<boolean>;
  private restrictedTypes: RestrictedCipherType[] = [];

  constructor(
    protected cipherAuthorizationService: CipherAuthorizationService,
    protected restrictedItemTypesService: RestrictedItemTypesService,
    protected routedVaultFilterService: RoutedVaultFilterService,
    private configService: ConfigService,
  ) {
    this.showCopyAndLaunchActions$ = this.configService.getFeatureFlag$(
      FeatureFlag.PM28091_AddCopyAndQuickLaunchActions,
    );
    this.canDeleteSelected$ = this.selection.changed.pipe(
      startWith(null),
      switchMap(() => {
        const ciphers = this.selection.selected
          .filter((item) => item.cipher)
          .map((item) => item.cipher);

        if (this.selection.selected.length === 0) {
          return of(true);
        }

        const canDeleteCiphers$ = ciphers.map((c) =>
          cipherAuthorizationService.canDeleteCipher$(c, this.showAdminActions),
        );

        const canDeleteCollections = this.selection.selected
          .filter((item) => item.collection)
          .every((item) => item.collection && this.canDeleteCollection(item.collection));

        const canDelete$ = combineLatest(canDeleteCiphers$).pipe(
          map((results) => results.every((item) => item) && canDeleteCollections),
        );

        return canDelete$;
      }),
    );

    this.restrictedItemTypesService.restricted$.pipe(takeUntilDestroyed()).subscribe((types) => {
      this.restrictedTypes = types;
      this.refreshItems();
    });

    this.canRestoreSelected$ = this.selection.changed.pipe(
      startWith(null),
      switchMap(() => {
        const ciphers = this.selection.selected
          .filter((item) => item.cipher)
          .map((item) => item.cipher);

        if (this.selection.selected.length === 0) {
          return of(true);
        }

        const canRestoreCiphers$ = ciphers.map((c) =>
          cipherAuthorizationService.canRestoreCipher$(c, this.showAdminActions),
        );

        const canRestore$ = combineLatest(canRestoreCiphers$).pipe(
          map((results) => results.every((item) => item)),
        );

        return canRestore$;
      }),
      map((canRestore) => canRestore && this.showBulkTrashOptions),
    );

    this.disableMenu$ = this.canDeleteSelected$.pipe(
      map((canDelete) => {
        return (
          !this.bulkMoveAllowed &&
          !this.showAssignToCollections() &&
          !canDelete &&
          !this.showBulkEditCollectionAccess
        );
      }),
    );

    if (!this.batchBarService) {
      this.routedVaultFilterService.filter$
        .pipe(
          distinctUntilChanged(
            (prev, curr) =>
              prev.organizationId === curr.organizationId &&
              prev.collectionId === curr.collectionId &&
              prev.folderId === curr.folderId &&
              prev.type === curr.type &&
              prev.organizationIdParamType === curr.organizationIdParamType,
          ),
          takeUntilDestroyed(),
        )
        .subscribe(() => {
          this.clearSelection();
        });
    }
  }

  clearSelection() {
    this.selection.clear();
  }

  get showExtraColumn() {
    return this.showCollections || this.showGroups || this.showOwner;
  }

  get isAllSelected() {
    // Check selection against sorted items to match toggleAll() behavior
    const sortedItems = this.getSortedEditableItems();
    return sortedItems.slice(0, MaxSelectionCount).every((item) => this.selection.isSelected(item));
  }

  get isEmpty() {
    return this.dataSource.data.length === 0;
  }

  get bulkMoveAllowed() {
    return (
      this.showBulkMove && this.selection.selected.filter((item) => item.collection).length === 0
    );
  }

  get bulkArchiveAllowed() {
    const selectedCiphers = this.selection.selected.filter((item) => item.cipher !== undefined);
    if (selectedCiphers.length === 0 || !this.userCanArchive || this.showBulkTrashOptions) {
      return false;
    }

    return (
      this.userCanArchive &&
      !selectedCiphers.find((item) => item.cipher && item.cipher.archivedDate)
    );
  }

  // Bulk Unarchive button should appear for Archive vault even if user does not have archive permissions
  get bulkUnarchiveAllowed() {
    if (this.selection.selected.length === 0 || this.showBulkTrashOptions) {
      return false;
    }

    return !this.selection.selected.find((item) => !item.cipher?.archivedDate);
  }

  //@TODO: remove this function when removing the limitItemDeletion$ feature flag.
  get showDelete(): boolean {
    if (this.selection.selected.length === 0) {
      return true;
    }

    const hasPersonalItems = this.hasPersonalItems();
    const uniqueCipherOrgIds = this.getUniqueOrganizationIds();

    const canManageCollectionCiphers = this.selection.selected
      .filter((item) => item.cipher)
      .every(({ cipher }) => this.canManageCollection(cipher));

    const canDeleteCollections = this.selection.selected
      .filter((item) => item.collection)
      .every((item) => item.collection && this.canDeleteCollection(item.collection));

    const userCanDeleteAccess = canManageCollectionCiphers && canDeleteCollections;

    if (
      userCanDeleteAccess ||
      (hasPersonalItems && (!uniqueCipherOrgIds.size || userCanDeleteAccess))
    ) {
      return true;
    }

    return false;
  }

  get bulkAssignToCollectionsAllowed() {
    return (
      this.showBulkAddToCollections &&
      this.ciphers.length > 0 &&
      !this.anySelectedCiphersAreArchived
    );
  }

  get anySelectedCiphersAreArchived() {
    return this.selection.selected.some(
      (item) => item.cipher && CipherViewLikeUtils.isArchived(item.cipher),
    );
  }

  protected canEditCollection(collection: CollectionView): boolean {
    // Only allow deletion if collection editing is enabled and not deleting "Unassigned"
    if (collection.id === Unassigned) {
      return false;
    }

    const organization = this.allOrganizations.find((o) => o.id === collection.organizationId);

    return collection.canEdit(organization);
  }

  protected canDeleteCollection(collection: CollectionView): boolean {
    // Only allow deletion if collection editing is enabled and not deleting "Unassigned"
    if (collection.id === Unassigned) {
      return false;
    }

    const organization = this.allOrganizations.find((o) => o.id === collection.organizationId);

    return collection.canDelete(organization);
  }

  protected canViewCollectionInfo(collection: CollectionView) {
    const organization = this.allOrganizations.find((o) => o.id === collection.organizationId);
    return collection.canViewCollectionInfo(organization);
  }

  protected toggleAll() {
    if (this.isAllSelected) {
      this.selection.clear();
    } else {
      const sortedItems = this.getSortedEditableItems();
      this.selection.select(...sortedItems.slice(0, MaxSelectionCount));
    }
  }

  /**
   * Returns editableItems sorted according to the current table sort configuration.
   * This ensures bulk selection matches the visual order displayed to the user.
   */
  private getSortedEditableItems(): VaultItem<C>[] {
    const currentSort = this.dataSource.sort;
    const items = [...this.editableItems];

    // If no sort function is set, return items in their original order (as displayed in table)
    if (!currentSort || !currentSort.fn) {
      return items;
    }

    // Apply sort function with direction modifier (matches TableDataSource.sortData behavior)
    const directionModifier = currentSort.direction === "asc" ? 1 : -1;
    return items.sort((a, b) => currentSort.fn(a, b, currentSort.direction) * directionModifier);
  }

  protected event(event: VaultItemEvent<C>) {
    this.onEvent.emit(event);
  }

  protected bulkMoveToFolder() {
    this.event({
      type: "moveToFolder",
      items: this.selection.selected
        .filter((item) => item.cipher !== undefined)
        .map((item) => item.cipher),
    });
  }

  protected bulkArchive() {
    this.event({
      type: "archive",
      items: this.selection.selected
        .filter((item) => item.cipher !== undefined)
        .map((item) => item.cipher),
    });
  }

  protected bulkUnarchive() {
    this.event({
      type: "unarchive",
      items: this.selection.selected
        .filter((item) => item.cipher !== undefined)
        .map((item) => item.cipher),
    });
  }

  protected bulkRestore() {
    this.event({
      type: "restore",
      items: this.selection.selected
        .filter((item) => item.cipher !== undefined)
        .map((item) => item.cipher),
    });
  }

  protected bulkDelete() {
    this.event({
      type: "delete",
      items: this.selection.selected,
    });
  }

  protected canClone$(vaultItem: VaultItem<C>): Observable<boolean> {
    return this.restrictedItemTypesService.restricted$.pipe(
      switchMap((restrictedTypes) => {
        // This will check for restrictions from org policies before allowing cloning.
        const isItemRestricted = restrictedTypes.some(
          (rt) => rt.cipherType === CipherViewLikeUtils.getType(vaultItem.cipher),
        );
        if (isItemRestricted) {
          return of(false);
        }
        return this.cipherAuthorizationService.canCloneCipher$(
          vaultItem.cipher,
          this.showAdminActions,
        );
      }),
    );
  }

  protected canEditCipher(cipher: C) {
    if (cipher.organizationId == null) {
      return true;
    }

    const organization = this.allOrganizations.find((o) => o.id === cipher.organizationId);
    return (organization?.canEditAllCiphers && this.viewingOrgVault) || cipher.edit;
  }

  protected canAssignCollections(cipher: C) {
    const organization = this.allOrganizations.find((o) => o.id === cipher.organizationId);
    const editableCollections = this.allCollections.filter((c) => !c.readOnly);

    return (
      (organization?.canEditAllCiphers && this.viewingOrgVault) ||
      (CipherViewLikeUtils.canAssignToCollections(cipher) && editableCollections.length > 0)
    );
  }

  protected canManageCollection(cipher: C) {
    // If the cipher is not part of an organization (personal item), user can manage it
    if (cipher.organizationId == null) {
      return true;
    }

    // Check for admin access in AC vault
    if (this.showAdminActions) {
      const organization = this.allOrganizations.find((o) => o.id === cipher.organizationId);
      // If the user is an admin, they can delete an unassigned cipher
      if (cipher.collectionIds.length === 0) {
        return organization?.canEditUnmanagedCollections === true;
      }

      if (
        organization?.permissions.editAnyCollection ||
        (organization?.allowAdminAccessToAllCollectionItems && organization.isAdmin)
      ) {
        return true;
      }
    }

    if (this.activeCollection) {
      return this.activeCollection.manage === true;
    }

    return this.allCollections
      .filter((c) => cipher.collectionIds.includes(c.id as any))
      .some((collection) => collection.manage);
  }

  private refreshItems() {
    const collections: VaultItem<C>[] = this.collections.map((collection) => ({ collection }));
    const ciphers: VaultItem<C>[] = this.ciphers
      .filter(
        (cipher) =>
          !this.restrictedItemTypesService.isCipherRestricted(cipher, this.restrictedTypes),
      )
      .map((cipher) => ({ cipher }));
    const items: VaultItem<C>[] = [].concat(collections).concat(ciphers);

    // Ciphers are selectable only if the user can edit them; collections only if they can be edited or deleted
    this.editableItems = items.filter(
      (item) =>
        (item.cipher !== undefined && this.canEditCipher(item.cipher)) ||
        (item.collection !== undefined &&
          (this.canEditCollection(item.collection) || this.canDeleteCollection(item.collection))),
    );

    this.dataSource.data = items;
  }

  protected bulkEditCollectionAccess() {
    this.event({
      type: "bulkEditCollectionAccess",
      items: this.selection.selected
        .filter((item) => item.collection !== undefined)
        .map((item) => item.collection),
    });
  }

  protected assignToCollections() {
    this.event({
      type: "assignToCollections",
      items: this.selection.selected
        .filter((item) => item.cipher !== undefined)
        .map((item) => item.cipher),
    });
  }

  protected showAssignToCollections(): boolean {
    if (!this.showBulkMove) {
      return false;
    }

    // When the user doesn't belong to an organization, hide assign to collections
    if (this.allOrganizations.length === 0) {
      return false;
    }

    if (this.selection.selected.length === 0) {
      return false;
    }

    const hasPersonalItems = this.hasPersonalItems();
    const uniqueCipherOrgIds = this.getUniqueOrganizationIds();
    const hasEditableCollections = this.allCollections.some((collection) => {
      return !collection.readOnly;
    });

    // Return false if items are from different organizations
    if (uniqueCipherOrgIds.size > 1) {
      return false;
    }

    // If all selected items are personal, return based on personal items
    if (uniqueCipherOrgIds.size === 0 && hasEditableCollections) {
      return hasPersonalItems;
    }

    const [orgId] = uniqueCipherOrgIds;
    const organization = this.allOrganizations.find((o) => o.id === orgId);

    const canEditOrManageAllCiphers = organization?.canEditAllCiphers && this.viewingOrgVault;

    const collectionNotSelected =
      this.selection.selected.filter((item) => item.collection).length === 0;

    return (
      (canEditOrManageAllCiphers || this.allCiphersHaveEditAccess()) &&
      collectionNotSelected &&
      hasEditableCollections
    );
  }

  /**
   * Sorts VaultItems, grouping collections before ciphers, and sorting each group alphabetically by name.
   */
  protected sortByName = (a: VaultItem<C>, b: VaultItem<C>, direction: SortDirection) => {
    // Collections before ciphers (direction-independent)
    const collectionCompare = this.prioritizeCollections(a, b);
    if (collectionCompare !== 0) {
      return collectionCompare;
    }

    // Name comparison (direction-dependent, handled by directionModifier)
    return this.compareNames(a, b);
  };

  /**
   * Sorts VaultItems based on group names
   */
  protected sortByGroups = (a: VaultItem<C>, b: VaultItem<C>, direction: SortDirection) => {
    if (
      !(a.collection instanceof CollectionAdminView) &&
      !(b.collection instanceof CollectionAdminView)
    ) {
      return 0;
    }

    const getFirstGroupName = (collection: CollectionAdminView): string => {
      if (collection.groups.length > 0) {
        return collection.groups.map((group) => this.getGroupName(group.id) || "").sort()[0];
      }
      return null;
    };

    // Collections before ciphers (direction-independent)
    const collectionCompare = this.prioritizeCollections(a, b);
    if (collectionCompare !== 0) {
      return collectionCompare;
    }

    const aGroupName = getFirstGroupName(a.collection as CollectionAdminView);
    const bGroupName = getFirstGroupName(b.collection as CollectionAdminView);

    // Collections with groups come before collections without groups.
    // If a collection has no groups, getFirstGroupName returns null.
    if (aGroupName === null) {
      return 1;
    }

    if (bGroupName === null) {
      return -1;
    }

    return aGroupName.localeCompare(bGroupName);
  };

  /**
   * Sorts VaultItems based on their permissions, with higher permissions taking precedence.
   * If permissions are equal, it falls back to sorting by name.
   */
  protected sortByPermissions = (a: VaultItem<C>, b: VaultItem<C>, direction: SortDirection) => {
    const getPermissionPriority = (item: VaultItem<C>): number => {
      const permission = item.collection
        ? this.getCollectionPermission(item.collection)
        : this.getCipherPermission(item.cipher);

      const priorityMap = {
        [CollectionPermission.Manage]: 5,
        [CollectionPermission.Edit]: 4,
        [CollectionPermission.EditExceptPass]: 3,
        [CollectionPermission.View]: 2,
        [CollectionPermission.ViewExceptPass]: 1,
        NoAccess: 0,
      };

      return priorityMap[permission] ?? -1;
    };

    // Collections before ciphers (direction-independent)
    const collectionCompare = this.prioritizeCollections(a, b);
    if (collectionCompare !== 0) {
      return collectionCompare;
    }

    const priorityA = getPermissionPriority(a);
    const priorityB = getPermissionPriority(b);

    // Higher priority first (direction-dependent, handled by directionModifier)
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    // Fallback to name comparison (direction-dependent, handled by directionModifier)
    return this.compareNames(a, b);
  };

  private compareNames(a: VaultItem<C>, b: VaultItem<C>): number {
    const getName = (item: VaultItem<C>) => item.collection?.name || item.cipher?.name;
    return getName(a)?.localeCompare(getName(b)) ?? -1;
  }

  /**
   * Sorts VaultItems by prioritizing collections over ciphers.
   * Always returns -1 for collections before ciphers, regardless of sort direction.
   * This comparison is direction-independent; the direction is applied separately via directionModifier.
   */
  private prioritizeCollections(a: VaultItem<C>, b: VaultItem<C>): number {
    if (a.collection && !b.collection) {
      return -1; // a (collection) comes before b (cipher)
    }

    if (!a.collection && b.collection) {
      return 1; // b (collection) comes before a (cipher)
    }

    return 0; // Both are collections or both are ciphers
  }

  private hasPersonalItems(): boolean {
    return this.selection.selected.some(({ cipher }) => !cipher?.organizationId);
  }

  private allCiphersHaveEditAccess(): boolean {
    return this.selection.selected
      .filter(({ cipher }) => cipher)
      .every(({ cipher }) => cipher?.edit && cipher?.viewPassword);
  }

  private getUniqueOrganizationIds(): Set<string | [] | OrganizationId> {
    return new Set(this.selection.selected.flatMap((i) => i.cipher?.organizationId ?? []));
  }

  private getGroupName(groupId: string): string | undefined {
    return this.allGroups.find((g) => g.id === groupId)?.name;
  }

  private getCollectionPermission(collection: CollectionView): ItemPermission {
    const organization = this.allOrganizations.find((o) => o.id === collection.organizationId);

    if (collection.id == Unassigned && organization?.canEditUnassignedCiphers) {
      return CollectionPermission.Edit;
    }

    if (collection.assigned) {
      return convertToPermission(collection);
    }

    return "NoAccess";
  }

  private getCipherPermission(cipher: C): ItemPermission {
    if (!cipher.organizationId || cipher.collectionIds.length === 0) {
      return CollectionPermission.Manage;
    }

    const filteredCollections = this.allCollections?.filter((collection) => {
      if (collection.assigned) {
        return cipher.collectionIds.find((id) => {
          if (collection.id === id) {
            return collection;
          }
        });
      }
    });

    if (filteredCollections?.length === 1) {
      return convertToPermission(filteredCollections[0]);
    }

    if (filteredCollections?.length > 0) {
      const permissions = filteredCollections.map((collection) => convertToPermission(collection));

      const orderedPermissions = [
        CollectionPermission.Manage,
        CollectionPermission.Edit,
        CollectionPermission.EditExceptPass,
        CollectionPermission.View,
        CollectionPermission.ViewExceptPass,
      ];

      return orderedPermissions.find((perm) => permissions.includes(perm));
    }

    return "NoAccess";
  }
}
