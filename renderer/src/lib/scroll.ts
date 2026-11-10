// The app scrolls inside #main-scroll rather than the window -- the sidebar
// stays put while content moves -- so window.scrollTo does nothing here.

/**
 * Returns the page to the top.
 *
 * Switching tabs keeps whatever scroll position the previous tab had, which
 * lands you partway down a list you haven't seen, with the header and search
 * controls above the fold. Jumping rather than smooth-scrolling: a tab switch
 * replaces the content outright, so animating a journey through content that
 * is already gone just delays the new view.
 */
export function scrollMainToTop() {
  document.getElementById("main-scroll")?.scrollTo({ top: 0, behavior: "auto" });
}
