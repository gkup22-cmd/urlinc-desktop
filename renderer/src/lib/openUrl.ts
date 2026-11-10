// Open an external URL in an existing same-origin browser tab when possible,
// rather than always creating a new one.
//
// Flow:
//   1. Send a window.postMessage to the URLinc extension's content script.
//   2. The extension's background finds a tab whose origin matches the URL
//      and focuses it (navigating to the exact URL), or creates a new tab.
//   3. If the extension doesn't acknowledge within 200 ms (not installed /
//      context gone), fall back to window.open with a hostname-keyed target
//      name — that at least reuses tabs opened via URLinc itself.
export function openUrl(url: string): void {
  // Resolve against the app's origin before handing the URL anywhere.
  //
  // Uploaded files -- stories, source icons, anything that went through
  // /storage/uploads -- are stored as root-relative paths like
  // "/api/storage/objects/uploads/<id>". Passed to the extension as-is, they
  // get opened in the extension's own context, where that path resolves
  // against chrome-extension://<id> and fails with ERR_FILE_NOT_FOUND. The
  // file is fine; the base is wrong. Making the URL absolute up front removes
  // the ambiguity for every path this can take.
  let target = url;
  try { target = new URL(url, window.location.origin).href; } catch { /* keep as-is */ }

  let handled = false;

  const onAck = (evt: MessageEvent) => {
    if ((evt as MessageEvent<{ type?: string }>).data?.type === "URLINC_TAB_OPENED") {
      handled = true;
      window.removeEventListener("message", onAck);
    }
  };

  window.addEventListener("message", onAck);
  window.postMessage({ type: "URLINC_OPEN_OR_FOCUS_TAB", url: target }, "*");

  setTimeout(() => {
    window.removeEventListener("message", onAck);
    if (!handled) {
      let name = "_blank";
      try { name = new URL(target).hostname.replace(/\./g, "-"); } catch { /* keep _blank */ }
      window.open(target, name);
    }
  }, 200);
}
