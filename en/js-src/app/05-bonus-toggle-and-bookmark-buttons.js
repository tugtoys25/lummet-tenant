// =====================================================
// CASINO CARD BONUS ROWS (click to expand)
// =====================================================
// Delegated on document so it works for cards injected after page
// load too (load-more, AJAX pagination) without re-binding anything.
// Only one .js-bonusToggle per .bonus-row, so toggling that row's
// own .is-open class is all this needs to do -- the CSS
// (.bonus-row.is-open .bonus-row__details) handles the expand/collapse.
document.addEventListener("click", (event) => {
  const toggle = event.target.closest(".js-bonusToggle");
  if (!toggle) return;

  const row = toggle.closest(".bonus-row");
  if (!row) return;

  const isOpen = row.classList.toggle("is-open");
  toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
});

function updateBookmarkButtons() {
  document.querySelectorAll("[data-bookmark-slug]").forEach(button => {
    const slug = button.dataset.bookmarkSlug;
    const bookmarked = userBookmarks.has(slug);

    button.classList.toggle(
      "is-bookmarked",
      bookmarked
    );

    button.setAttribute(
      "aria-pressed",
      bookmarked ? "true" : "false"
    );

    const icon = button.querySelector(".bookmark-icon");

    if (icon) {
      icon.textContent = bookmarked ? "♥" : "♡";
    }

    const card = button.closest(".casino-card");
    const name = card?.querySelector("h3")?.textContent?.trim() || "casino";

    button.setAttribute(
      "aria-label",
      bookmarked
        ? `Remove ${name} from bookmarks`
        : `Save ${name} to bookmarks`
    );

    button.setAttribute(
      "title",
      bookmarked
        ? `Remove ${name} from bookmarks`
        : `Save ${name} to bookmarks`
    );
  });
}

async function toggleCasinoBookmark(button) {
  const slug = button.dataset.bookmarkSlug;

  if (!slug) return;

  const currentlyBookmarked = userBookmarks.has(slug);

  button.disabled = true;
  button.classList.add("is-loading");

  try {
    // Check whether the user is actually authenticated.
    const profileRes = await fetch("/en/api/v1/user/profile", {
      credentials: "same-origin",
      headers: {
        "Accept": "application/json"
      }
    });

    const profileData = await profileRes.json().catch(() => ({}));

    // Not authenticated
    if (
      !profileRes.ok ||
      !profileData.user ||
      !profileData.user.id
    ) {
      window.location.href =
        `/en/login?redirect=${encodeURIComponent(
          window.location.pathname + window.location.search
        )}`;
      return;
    }

    const endpoint = currentlyBookmarked
      ? "/en/api/v1/user/bookmark/remove"
      : "/en/api/v1/user/bookmark/add";

    const res = await fetch(endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        casino_slug: slug
      })
    });

    if (res.status === 401 || res.status === 403) {
      window.location.href =
        `/en/login?redirect=${encodeURIComponent(
          window.location.pathname + window.location.search
        )}`;
      return;
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.success === false) {
      throw new Error(data.error || "Bookmark request failed");
    }

    if (currentlyBookmarked) {
      userBookmarks.delete(slug);
    } else {
      userBookmarks.add(slug);
    }

    updateBookmarkButtons();

  } catch (error) {
    console.error("Bookmark error:", error);
  } finally {
    button.disabled = false;
    button.classList.remove("is-loading");
  }
}

