// =====================================================
// CASINO BOOKMARKS
// =====================================================

let userBookmarks = new Set();

document.addEventListener("DOMContentLoaded", () => {
  initCasinoBookmarks();
});

async function initCasinoBookmarks() {
  const buttons = document.querySelectorAll("[data-bookmark-slug]");

  if (!buttons.length) return;

  /*
   * Guests will receive an authentication error from this endpoint.
   * That is expected. We simply leave the cards in their default state.
   */
  try {
    const res = await fetch("/en/api/v1/user/bookmarks", {
      credentials: "same-origin",
      headers: {
        "Accept": "application/json"
      }
    });

    if (!res.ok) {
      return;
    }

    const data = await res.json();

    userBookmarks = new Set(
      (data.bookmarks || [])
        .map(bookmark => bookmark.slug || bookmark.casino_slug)
        .filter(Boolean)
    );

    updateBookmarkButtons();
  } catch {
    // Guest or unavailable session.
  }

  buttons.forEach(button => {
    if (button.dataset.bookmarkInitialized === "true") {
      return;
    }

    button.dataset.bookmarkInitialized = "true";

    button.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();

      await toggleCasinoBookmark(button);
    });
  });

  updateBookmarkButtons();
}

