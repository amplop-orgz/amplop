// WhatsApp links and copying (06 S06-50). A secret (the invite link) goes through the app scheme,
// so no web request ever carries it.
export function whatsappUrl(text: string, opts: { secret: boolean }): string {
  const q = encodeURIComponent(text);
  return opts.secret ? `whatsapp://send?text=${q}` : `https://wa.me/?text=${q}`;
}

/** Copies from inside a tap. A promise keeps Safari's permission while the text is still being made. */
export async function copyText(text: string | Promise<string>): Promise<void> {
  if (typeof ClipboardItem !== "undefined" && typeof navigator.clipboard.write === "function") {
    const blob = Promise.resolve(text).then((t) => new Blob([t], { type: "text/plain" }));
    await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
    return;
  }
  await navigator.clipboard.writeText(await text);
}
