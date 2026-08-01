/**
 * Return `url` only when it is a plain http(s) link, else `undefined`.
 *
 * Values like `contact.linkedin` (scraped from search results or typed by hand)
 * and `meeting.link` (user-entered) are rendered as anchor `href`s. React does
 * not block a `javascript:`/`data:` URL — it only warns — so a stored payload
 * would execute on click. Routing every data-derived href through this guard
 * drops any non-http(s) scheme to `undefined` (a non-navigable anchor).
 */
export function safeUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? trimmed
      : undefined;
  } catch {
    return undefined;
  }
}
