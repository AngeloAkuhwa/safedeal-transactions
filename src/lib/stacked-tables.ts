/**
 * Mobile fallback for dense data tables.
 *
 * Tables marked with the `sd-stack` class collapse into one card per row below
 * the md breakpoint (see index.css). Each cell needs the label of its column so
 * nothing is dropped; this module mirrors every <th> caption into the matching
 * <td data-label> and keeps it in sync as rows render or change.
 */
const LABEL_ATTR = "data-label";

export function labelStackedTable(table: HTMLTableElement): void {
  const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th")).map((th) =>
    (th.textContent ?? "").trim(),
  );
  if (!headers.length) return;
  for (const row of Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr"))) {
    Array.from(row.cells).forEach((cell, index) => {
      const label = headers[index] ?? "";
      if (cell.getAttribute(LABEL_ATTR) !== label) cell.setAttribute(LABEL_ATTR, label);
    });
  }
}

export function labelStackedTables(root: ParentNode = document): void {
  for (const table of Array.from(root.querySelectorAll<HTMLTableElement>("table.sd-stack"))) {
    labelStackedTable(table);
  }
}

let observer: MutationObserver | null = null;

export function installStackedTableLabels(): () => void {
  if (typeof document === "undefined" || observer) return () => undefined;
  labelStackedTables();
  let queued = false;
  observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      labelStackedTables();
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return () => {
    observer?.disconnect();
    observer = null;
  };
}
