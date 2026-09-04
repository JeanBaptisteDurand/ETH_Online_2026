/**
 * Section 05 — sorting the matrix. Loaded with import() when the table comes into view.
 *
 * The table is real DOM before this file exists: sorting is an affordance, not the content.
 * The elision row is not data, so it never sorts — it stays where the truncation happens and
 * keeps saying how many rows are missing.
 */

type Dir = "asc" | "desc";

export function mount(root: HTMLElement): void {
  const table = root as HTMLTableElement;
  const body = table.tBodies[0];
  if (!body) return;

  const state: { key: string; dir: Dir } = { key: "bps", dir: "desc" };

  const value = (tr: HTMLTableRowElement, key: string): number =>
    Number(tr.dataset[key] ?? 0);

  function apply(key: string, dir: Dir): void {
    const rows = [...body.rows];
    const elide = rows.find((r) => r.classList.contains("elide")) ?? null;
    const data = rows.filter((r) => r !== elide);
    const at = elide ? rows.indexOf(elide) : -1;

    data.sort((a, b) => (dir === "desc" ? value(b, key) - value(a, key) : value(a, key) - value(b, key)));

    /* 180 ms, --e-move, and only because the rows really did move. */
    const frag = document.createDocumentFragment();
    data.forEach((r) => frag.append(r));
    body.replaceChildren(frag);
    if (elide && at >= 0) {
      const anchor = body.rows[Math.min(at, body.rows.length - 1)];
      if (anchor) body.insertBefore(elide, anchor);
      else body.append(elide);
    }

    table.querySelectorAll<HTMLElement>("th.sortable").forEach((th) => {
      const own = th.dataset.sort === key;
      th.setAttribute("aria-sort", own ? (dir === "desc" ? "descending" : "ascending") : "none");
      th.dataset.active = own ? "1" : "0";
    });

    body.animate([{ opacity: 0.55 }, { opacity: 1 }], { duration: 180, easing: "cubic-bezier(0.2,0,0,1)" });
  }

  const activate = (th: HTMLElement) => {
    const key = th.dataset.sort;
    if (!key) return;
    state.dir = state.key === key && state.dir === "desc" ? "asc" : "desc";
    state.key = key;
    apply(state.key, state.dir);
  };

  table.querySelectorAll<HTMLElement>("th.sortable").forEach((th) => {
    th.addEventListener("click", () => activate(th));
    th.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate(th);
      }
    });
  });

  table.dataset.enhanced = "yes";
}
