/**
 * Floating TablePlus-style pager and page size control at the bottom of data grids.
 */
import { openModal, toast } from "../../core/dialogs";
import { formatNumber, h, icon, iconButton } from "../../core/dom";
import { showContextMenu, type MenuItem } from "../../core/contextMenu";

export const PAGE_SIZES = [10, 100, 250, 400, 500, 1000];
export const DEFAULT_PAGE_SIZE_KEY = "datastudio.defaultPageSize";

export interface PagerState {
  offset: number;
  count: number;
  total: number | null;
  exactTotal: boolean;
  elapsedMs?: number;
  hasMore: boolean;
  canGoFirst?: boolean;
  canGoPrev?: boolean;
  canGoNext?: boolean;
  canGoLast?: boolean;
}

export interface PageSizePillOptions {
  initialSize?: number;
  onPageSizeChange: (size: number) => void;
  onCountRows?: () => void;
  onFirst?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onLast?: () => void;
}

export interface PageSizePillControl {
  readonly element: HTMLElement;
  getSize(): number;
  setSize(size: number, triggerCallback?: boolean): void;
  setTotalCount(count: number | string | null): void;
  update(state: PagerState): void;
  setLoading(loading: boolean): void;
}

export function loadDefaultPageSize(): number {
  const stored = Number(localStorage.getItem(DEFAULT_PAGE_SIZE_KEY));
  return stored > 0 ? stored : 200;
}

export function saveDefaultPageSize(size: number): void {
  localStorage.setItem(DEFAULT_PAGE_SIZE_KEY, String(size));
  toast(`Set ${size} rows as default page size`, "success");
}

export function createPageSizePill(options: PageSizePillOptions): PageSizePillControl {
  let currentSize = options.initialSize ?? loadDefaultPageSize();
  const label = h("span", {}, currentSize >= 50000 ? "All rows" : `${currentSize} rows`);
  const sizeButton = h(
    "button",
    {
      class: "table-page-size-pill",
      type: "button",
      title: "Change page size",
    },
    label,
    icon("chevron"),
  );

  const hasPagerCallbacks = Boolean(options.onFirst || options.onPrev || options.onNext || options.onLast);

  const firstBtn = iconButton("first", "First page", () => options.onFirst?.());
  firstBtn.disabled = true;

  const prevBtn = iconButton("prev", "Previous page", () => options.onPrev?.());
  prevBtn.disabled = true;

  const pageInfo = h("span", { class: "pager-info" }, `${currentSize >= 50000 ? "All" : currentSize} rows`);

  const countBtn = h("button", { class: "link-button pager-count", type: "button", title: "Count exact total rows" }, "Count");
  countBtn.hidden = true;
  countBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    options.onCountRows?.();
  });

  const nextBtn = iconButton("chevron", "Next page", () => options.onNext?.());
  nextBtn.disabled = true;

  const lastBtn = iconButton("last", "Last page", () => options.onLast?.());
  lastBtn.disabled = true;

  const pagerNav = h("div", { class: "table-pager-nav" }, firstBtn, prevBtn, pageInfo, countBtn, nextBtn, lastBtn);
  pagerNav.hidden = !hasPagerCallbacks;

  const divider = h("span", { class: "pager-divider" });
  divider.hidden = !hasPagerCallbacks;

  const container = h("div", { class: "table-pager-bar", role: "navigation", "aria-label": "Pagination" }, pagerNav, divider, sizeButton);

  function updateLabel(): void {
    label.textContent = currentSize >= 50000 ? "All rows" : `${currentSize} rows`;
  }

  function promptCustomPageSize(): void {
    const input = h("input", {
      type: "number",
      class: "input",
      min: "1",
      max: "100000",
      value: String(currentSize),
      style: "width: 100%; box-sizing: border-box;",
    });
    const body = h("div", { style: "display: flex; flex-direction: column; gap: 8px;" }, h("label", {}, "Enter number of rows per page:"), input);
    openModal(
      "Custom Page Size",
      body,
      [
        {
          label: "Apply",
          primary: true,
          run: () => {
            const val = Math.max(1, Math.min(100000, Number(input.value) || 200));
            currentSize = val;
            updateLabel();
            options.onPageSizeChange(val);
          },
        },
        { label: "Cancel", run: () => undefined },
      ],
      { width: 340 },
    );
    setTimeout(() => input.focus(), 50);
  }

  function openMenu(event: MouseEvent): void {
    const defaultLimit = loadDefaultPageSize();
    const items: MenuItem[] = [];

    if (options.onCountRows) {
      items.push({
        label: "Count Rows",
        icon: "task",
        run: () => options.onCountRows?.(),
      });
      items.push("separator");
    }

    items.push({
      label: "Page Size",
      disabled: true,
      run: () => undefined,
    });

    for (const size of PAGE_SIZES) {
      items.push({
        label: `${size === currentSize ? "✓ " : "  "}${size}${size === defaultLimit ? " Default" : ""}`,
        run: () => {
          currentSize = size;
          updateLabel();
          options.onPageSizeChange(size);
        },
      });
    }

    items.push({
      label: `${currentSize >= 50000 ? "✓ " : "  "}All`,
      run: () => {
        currentSize = 50000;
        updateLabel();
        options.onPageSizeChange(50000);
      },
    });

    items.push({
      label: "Custom...",
      run: () => promptCustomPageSize(),
    });

    items.push("separator");
    items.push({
      label: "Set as Default",
      run: () => saveDefaultPageSize(currentSize),
    });

    showContextMenu(event, items);
  }

  sizeButton.addEventListener("click", (event) => {
    event.stopPropagation();
    openMenu(event);
  });

  return {
    element: container,
    getSize: () => currentSize,
    setSize: (size: number, triggerCallback = false) => {
      currentSize = size;
      updateLabel();
      if (triggerCallback) options.onPageSizeChange(size);
    },
    setTotalCount: (count: number | string | null) => {
      if (count !== null) {
        label.textContent = `${count} rows`;
      } else {
        updateLabel();
      }
    },
    update: (state: PagerState) => {
      pagerNav.hidden = false;
      divider.hidden = false;
      const { offset, count, total, exactTotal, elapsedMs, hasMore } = state;

      const totalText = total !== null ? `${exactTotal ? "" : "~"}${formatNumber(total)}` : hasMore ? "?" : formatNumber(offset + count);

      const range = count === 0 ? `0 of ${totalText}` : `${formatNumber(offset + 1)}–${formatNumber(offset + count)} of ${totalText}`;

      const elapsedText = elapsedMs != null && elapsedMs > 0 ? ` · ${elapsedMs} ms` : "";
      pageInfo.textContent = `${range}${elapsedText}`;
      pageInfo.title = total !== null ? (exactTotal ? "Exact count" : "Estimated count; click Count for exact number") : "Total rows unknown; click Count";

      const before = state.canGoPrev !== undefined ? state.canGoPrev : offset > 0;
      const after = state.canGoNext !== undefined ? state.canGoNext : hasMore;

      firstBtn.disabled = state.canGoFirst !== undefined ? !state.canGoFirst : offset <= 0;
      prevBtn.disabled = !before;
      nextBtn.disabled = !after;
      lastBtn.disabled = state.canGoLast !== undefined ? !state.canGoLast : total === null || !exactTotal || offset + count >= total;

      countBtn.hidden = exactTotal || (!hasMore && offset === 0);
    },
    setLoading: (loading: boolean) => {
      if (loading) {
        pageInfo.textContent = "Loading…";
        firstBtn.disabled = true;
        prevBtn.disabled = true;
        nextBtn.disabled = true;
        lastBtn.disabled = true;
      }
    },
  };
}
