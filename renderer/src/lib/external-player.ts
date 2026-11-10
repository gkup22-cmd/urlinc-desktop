// Shared "open a Plex/Jellyfin item in that service's own web player"
// helpers -- used by both the Plex/Jellyfin Library tabs (home.tsx) and the
// watch-together page, which both need to reopen the exact same popup
// window rather than each keeping their own separate reference.
//
// Module-level, not component state -- needs to survive the owning
// component remounting and persist for the whole page session. A named
// <a target="..."> alone isn't enough here: once the opened tab navigates
// to plex.direct/the Jellyfin server (a different origin than urlinc.us),
// browsers stop trusting the name-to-window association for security
// reasons and open a fresh tab on the next click regardless of the target
// name. Holding the actual Window reference ourselves and navigating it
// directly sidesteps that.
// A plain window.open(url, name) with no features string opens a normal
// browser TAB in Chrome, which replaces whatever page you were looking at
// (e.g. hides the Watch Together chat until you switch tabs back). Passing
// a features string like this instead makes Chrome open a separate, movable
// window -- so the player and the URLinc tab (with chat) can sit side by
// side and stay visible at the same time.
const POPUP_FEATURES = `width=${Math.round(window.screen.availWidth * 0.7)},height=${Math.round(window.screen.availHeight * 0.8)},left=40,top=40`;

let plexPlayerWindow: Window | null = null;
export function openInPlexPlayer(url: string) {
  if (plexPlayerWindow && !plexPlayerWindow.closed) {
    plexPlayerWindow.location.href = url;
    plexPlayerWindow.focus();
  } else {
    // Deliberately no "noopener" here -- that would make window.open()
    // return null, losing the reference this whole trick depends on.
    plexPlayerWindow = window.open(url, "urlinc-plex-player", POPUP_FEATURES);
  }
}

let jellyfinPlayerWindow: Window | null = null;
export function openInJellyfinPlayer(url: string) {
  if (jellyfinPlayerWindow && !jellyfinPlayerWindow.closed) {
    jellyfinPlayerWindow.location.href = url;
    jellyfinPlayerWindow.focus();
  } else {
    jellyfinPlayerWindow = window.open(url, "urlinc-jellyfin-player", POPUP_FEATURES);
  }
}
