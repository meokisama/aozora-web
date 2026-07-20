/**
 * Merges paired fixed-layout image wrappers into one `.aoz-spread` section in
 * place, for the paginated reader. Grouping the two spread pages into one
 * text-free section makes the controller render them as a single centred page;
 * CSS places the halves side by side (RTL for RTL books).
 *
 * @param spreadPairs  `[[openerId, closerId], …]` (wrapper ids, opener first)
 */
export function mergeSpreadSections(container: HTMLElement, spreadPairs: string[][] | null, ppd: string): void {
  if (!spreadPairs || !spreadPairs.length) return;
  const byId = new Map<string, Element>();
  for (const child of Array.from(container.children)) {
    if (child.id) byId.set(child.id, child);
  }
  for (const [openerId, closerId] of spreadPairs) {
    const opener = byId.get(openerId);
    const closer = byId.get(closerId);
    if (!opener || !closer || opener.parentNode !== container || closer.parentNode !== container) continue;

    const spread = container.ownerDocument.createElement("div");
    spread.className = "aoz-spread aoz-no-text";
    spread.id = `aoz-spread-${openerId.replace(/^aoz-/, "")}`;
    spread.dataset.ppd = ppd;
    container.insertBefore(spread, opener);
    // Opener first; CSS flex-direction (row-reverse for rtl) sides it correctly.
    // Wrappers keep their ids so TOC/href jumps and char bookkeeping still resolve.
    spread.appendChild(opener);
    spread.appendChild(closer);
  }
}
