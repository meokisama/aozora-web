/**
 * Footnote detection. Builds an id→html map once at load so the popup works
 * regardless of which section is rendered (paginated mode keeps only the current
 * section live, and endnotes often live in a different section than their ref).
 */

const NOTE_TYPES = new Set(["footnote", "endnote", "rearnote", "note"]);

function epubTypes(el: Element): string[] {
  return (el.getAttribute("epub:type") || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

/** Note body: an epub:type note token or matching ARIA doc role. */
function isNoteBody(el: Element): boolean {
  if (epubTypes(el).some((t) => NOTE_TYPES.has(t))) return true;
  const role = el.getAttribute("role");
  return role === "doc-footnote" || role === "doc-endnote";
}

/** Noteref: the in-prose marker linking to a note body. */
function isNoteref(a: Element): boolean {
  if (epubTypes(a).includes("noteref")) return true;
  return a.getAttribute("role") === "doc-noteref";
}

/**
 * Maps fragment id → note inner HTML from flattened reader HTML. Bodies found
 * two ways: (1) elements declaring note semantics (epub:type/role); (2) <aside>
 * targets reached from a noteref link — catches books that type the link but not
 * the aside. Back-links inside notes point at prose markers, not <aside>, so they
 * don't pollute the map.
 */
export function collectFootnotes(html: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!html) return map;
  const doc = new DOMParser().parseFromString(html, "text/html");

  const add = (el: Element | null) => {
    if (!el?.id || map.has(el.id)) return;
    const inner = el.innerHTML.trim();
    if (inner) map.set(el.id, inner);
  };

  for (const el of doc.querySelectorAll("[id]")) {
    if (isNoteBody(el)) add(el);
  }

  for (const a of doc.querySelectorAll("a[href^='#']")) {
    if (!isNoteref(a)) continue;
    const id = decodeURIComponent((a.getAttribute("href") || "").slice(1));
    const target = id ? doc.getElementById(id) : null;
    if (target?.tagName === "ASIDE") add(target);
  }

  return map;
}
