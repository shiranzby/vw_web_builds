import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, computed, effect, input, output } from "@angular/core";

import { JslibModule } from "@bitwarden/angular/jslib.module";
import { NoResults, NoSendsIcon } from "@bitwarden/assets/svg";
import { SendView } from "@bitwarden/common/tools/send/models/view/send.view";
import {
  ButtonModule,
  NoItemsModule,
  SpinnerComponent,
  TableDataSource,
} from "@bitwarden/components";

import { SendSearchComponent } from "../send-search/send-search.component";
import { SendTableComponent } from "../send-table/send-table.component";

/** A state of the Send list UI. */
export const SendListState = Object.freeze({
  /** No Sends exist at all (File or Text). */
  Empty: "Empty",
  /** Sends exist, but none match the current Side Nav Filter (File or Text). */
  NoResults: "NoResults",
} as const);

/** A state of the Send list UI. */
export type SendListState = (typeof SendListState)[keyof typeof SendListState];

/**
 * A container component for displaying the Send list with search, table, and empty states.
 * Handles the presentation layer while delegating data management to services.
 */
@Component({
  selector: "tools-send-list",
  templateUrl: "./send-list.component.html",
  imports: [
    CommonModule,
    JslibModule,
    ButtonModule,
    NoItemsModule,
    SpinnerComponent,
    SendSearchComponent,
    SendTableComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SendListComponent {
  protected readonly noItemIcon = NoSendsIcon;
  protected readonly noResultsIcon = NoResults;
  protected readonly sendListState = SendListState;

  readonly sends = input.required<SendView[]>();
  readonly loading = input<boolean>(false);
  readonly disableSend = input<boolean>(false);
  readonly listState = input<SendListState | null>(null);
  readonly searchText = input<string>("");
  readonly hideSearchBar = input<boolean>(false);

  /**
   * Whether the account has any Sends at all, ignoring the current type filter/search.
   *
   * `sends` is the *filtered* list, so it is empty both when the account has no Sends and
   * when the active filter simply matches none — for example switching to "文件 Send" on an
   * account that only has text Sends unmounted the search bar entirely, making it impossible
   * to search your way back. Callers pass the unfiltered signal here so the bar tracks
   * "does this account have Sends" instead.
   */
  readonly hasAnySends = input<boolean>(false);

  protected readonly showSearchBar = computed(
    () =>
      (this.hasAnySends() || this.sends().length > 0 || this.searchText().length > 0) &&
      !this.hideSearchBar(),
  );

  protected readonly noSearchResults = computed(
    () => this.showSearchBar() && this.sends().length === 0,
  );

  // Reusable data source instance - updated reactively when sends change
  protected readonly dataSource = new TableDataSource<SendView>();

  constructor() {
    effect(() => {
      this.dataSource.data = this.sends();
    });
  }

  readonly editSend = output<SendView>();
  readonly copySend = output<SendView>();
  readonly removePassword = output<SendView>();
  readonly deleteSend = output<SendView>();

  protected onEditSend(send: SendView): void {
    this.editSend.emit(send);
  }

  protected onCopySend(send: SendView): void {
    this.copySend.emit(send);
  }

  protected onRemovePassword(send: SendView): void {
    this.removePassword.emit(send);
  }

  protected onDeleteSend(send: SendView): void {
    this.deleteSend.emit(send);
  }
}
