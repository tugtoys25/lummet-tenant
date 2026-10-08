document.addEventListener("DOMContentLoaded", async () => {
  try {
    // Set active nav link based on current URL
    const currentPath = window.location.pathname;
    document.querySelectorAll(".admin-nav a").forEach(link => {
      const href = link.getAttribute("href");
      if (href === currentPath) {
        link.classList.add("active");
      }
      // Also highlight "Casinos" when on casino edit/create
      if (href === "/en/dashboard/casinos" && currentPath.match(/^\/en\/dashboard\/casino\/edit\//)) {
        link.classList.add("active");
      }
    });


    const profile = await fetch("/en/api/v1/user/profile");
    if (!profile.ok) return;
    const data = await profile.json();
    const user = data.user;
    if (!user) return;

    // Admin sees everything
    if (user.role === "admin") return;

    const res = await fetch("/en/api/v1/user/permissions");
    const permData = await res.json();
    const rolePermissions = permData.permissions || {};

    //const res = await fetch("/en/api/v1/permissions/list");
    //const permData = await res.json();
    //const permissions = permData.permissions || {};
    //const rolePermissions = permissions[user.role] || {};

    // Permission helper
    const can = (resource, action) => {
      if (!resource) return true;
      return rolePermissions[resource]?.[action] === true;
    };

    // ==========================================
    // 1. NAV LINK FILTERING
    // ==========================================
    const navMap = {
      "/en/dashboard": null,
      "/en/dashboard/casinos": "casinos",
      "/en/dashboard/casino/create": "casinos",
      "/en/dashboard/reviews": "reviews",
      "/en/dashboard/news": "news",
      "/en/dashboard/updates": "platform-updates",
      "/en/dashboard/pages": "pages",
      "/en/dashboard/categories": "categories",
      "/en/dashboard/countries": "countries",
      "/en/dashboard/authors": "authors",
      "/en/dashboard/components": "components",
      "/en/dashboard/seo": "seo",
      "/en/dashboard/media": "media",
      "/en/dashboard/nav": "nav",
      "/en/dashboard/users": "users",
      "/en/dashboard/permissions": "permissions",
      "/en/dashboard/settings": "settings"
    };

    const adminOnlyPages = [
      "/en/dashboard/inquiries",
      "/en/dashboard/submissions",
      "/en/dashboard/notifications",
      "/en/dashboard/banners",
      "/en/dashboard/ai",
      "/en/dashboard/item-access"
    ];

    document.querySelectorAll(".admin-nav a").forEach(link => {
      const url = link.getAttribute("href");

      // Always show overview and logout
      if (url === "/en/dashboard" || url === "/en/api/v1/auth/logout") return;

      // Hide admin-only pages for non-admins
      if (adminOnlyPages.includes(url)) {
        link.style.display = "none";
        return;
      }

      const resource = navMap[url];
      if (resource && !can(resource, "read")) {
        link.style.display = "none";
      }
    });

    // ==========================================
    // 2. DETERMINE CURRENT PAGE RESOURCE
    // ==========================================
    const path = window.location.pathname;

    const pageResourceMap = {
      "/en/dashboard/casinos": "casinos",
      "/en/dashboard/casino/create": "casinos",
      "/en/dashboard/reviews": "reviews",
      "/en/dashboard/news": "news",
      "/en/dashboard/pages": "pages",
      "/en/dashboard/categories": "categories",
      "/en/dashboard/countries": "countries",
      "/en/dashboard/authors": "authors",
      "/en/dashboard/components": "components",
      "/en/dashboard/seo": "seo",
      "/en/dashboard/media": "media",
      "/en/dashboard/nav": "nav",
      "/en/dashboard/users": "users",
      "/en/dashboard/permissions": "permissions",
      "/en/dashboard/settings": "settings",
      "/en/dashboard/banners": "banners"
    };

    // Match edit sub-pages: /en/dashboard/casino/edit/:slug
    let currentResource = null;
    if (path.match(/^\/en\/dashboard\/casino\/edit\//)) {
      currentResource = "casinos";
    } else {
      currentResource = pageResourceMap[path];
    }

    if (!currentResource) return;

    // ==========================================
    // 3. HIDE/SHOW CREATE FORMS & BUTTONS
    // ==========================================
    if (!can(currentResource, "create")) {
      // Hide "Add/Create" header + everything after it until next h2 or end
      const createHeaders = [
        "Add Casino", "Create Review", "Add News Article", "Add Page",
        "Add Category", "Add Country", "Add Author", "Create Component",
        "Add / Edit Banner", "Assign Component to Page", "Add / Edit Nav Item",
        "Add / Edit SEO Meta", "Add Image", "Add / Edit Block"
      ];

      document.querySelectorAll("h2, h3").forEach(header => {
        const text = header.textContent.trim();
        if (createHeaders.some(h => text.includes(h))) {
          // Hide the header
          header.style.display = "none";
          // Hide all siblings after this header until next h2/h3
          let next = header.nextElementSibling;
          while (next && next.tagName !== "H2" && next.tagName !== "H3") {
            next.style.display = "none";
            next = next.nextElementSibling;
          }
        }
      });

      // Hide create/add buttons
      document.querySelectorAll("a.btn, button").forEach(btn => {
        const text = btn.textContent.trim().toLowerCase();
        const onclick = btn.getAttribute("onclick") || "";

        if (
          text.includes("+ add") ||
          text.includes("add casino") ||
          text.includes("create casino") ||
          text.includes("create review") ||
          text.includes("create article") ||
          text.includes("create page") ||
          text.includes("create category") ||
          text.includes("create country") ||
          text.includes("create author") ||
          text.includes("create component") ||
          text.includes("create banner") ||
          text.includes("add nav item") ||
          text.includes("save seo meta") ||
          text.includes("add to library") ||
          text.includes("add block") ||
          text.includes("assign to page") ||
          text.includes("submit for review") ||
          text.includes("send inquiry") ||
          text.includes("send notification") ||
          onclick.includes("mediaUploadArea")
        ) {
          btn.style.display = "none";
        }
      });

      // Hide form submit buttons for create (forms without hidden id field or with empty id)
      document.querySelectorAll("form").forEach(form => {
        const idField = form.querySelector("[name='id']");
        const submitBtn = form.querySelector("button[type='submit']");

        // If it's a create form (no id field, or id field is empty)
        if (submitBtn && (!idField || !idField.value)) {
          // Check if the form is a create form by its submit button text
          const btnText = submitBtn.textContent.trim().toLowerCase();
          if (
            btnText.includes("create") ||
            btnText.includes("add") ||
            btnText.includes("save") ||
            btnText.includes("assign")
          ) {
            // Hide the entire form
            form.style.display = "none";
          }
        }
      });
    }

    // ==========================================
    // 4. HIDE/SHOW EDIT BUTTONS & UPDATE FORMS
    // ==========================================
    if (!can(currentResource, "update")) {
      document.querySelectorAll("button, a.btn").forEach(btn => {
        const text = btn.textContent.trim().toLowerCase();
        const onclick = btn.getAttribute("onclick") || "";

        // Hide edit buttons by onclick function name
        if (
          onclick.includes("editReview") ||
          onclick.includes("editNews") ||
          onclick.includes("editPage") ||
          onclick.includes("editCategory") ||
          onclick.includes("editCountry") ||
          onclick.includes("editAuthor") ||
          onclick.includes("editComponent") ||
          onclick.includes("editSeoMeta") ||
          onclick.includes("editNavItem") ||
          onclick.includes("editBanner") ||
          onclick.includes("editAssignment") ||
          onclick.includes("editReviewBlock")
        ) {
          btn.style.display = "none";
        }

        // Hide by text
        if (text === "edit" || text === "change role") {
          btn.style.display = "none";
        }

        // Hide cancel edit buttons (part of edit flow)
        if (text.includes("cancel edit")) {
          btn.style.display = "none";
        }
      });

      // Hide update submit buttons (forms that have id field with value)
      document.querySelectorAll("form").forEach(form => {
        const idField = form.querySelector("[name='id']");
        if (idField && idField.value) {
          const submitBtn = form.querySelector("button[type='submit']");
          if (submitBtn) {
            const btnText = submitBtn.textContent.trim().toLowerCase();
            if (btnText.includes("update") || btnText.includes("save")) {
              // Don't hide the entire form — just disable the submit
              submitBtn.disabled = true;
              submitBtn.style.opacity = "0.5";
              submitBtn.style.cursor = "not-allowed";
            }
          }
        }
      });

      // If on casino edit page without update permission, redirect back
      if (path.match(/^\/en\/dashboard\/casino\/edit\//)) {
        window.location.href = "/en/dashboard/casinos";
      }
    }

    // ==========================================
    // 5. HIDE/SHOW DELETE BUTTONS
    // ==========================================
    if (!can(currentResource, "delete")) {
      document.querySelectorAll("button, a.btn").forEach(btn => {
        const text = btn.textContent.trim().toLowerCase();
        const onclick = btn.getAttribute("onclick") || "";

        if (
          text === "delete" ||
          text.includes("remove") ||
          onclick.includes("deleteCasino") ||
          onclick.includes("deleteReview") ||
          onclick.includes("deleteNewsArticle") ||
          onclick.includes("deletePage") ||
          onclick.includes("deleteCategory") ||
          onclick.includes("deleteCountry") ||
          onclick.includes("deleteAuthor") ||
          onclick.includes("deleteComponent") ||
          onclick.includes("deleteSeoMeta") ||
          onclick.includes("deleteNavItem") ||
          onclick.includes("deleteBanner") ||
          onclick.includes("deleteMedia") ||
          onclick.includes("deleteReviewBlock") ||
          onclick.includes("removeAssignment") ||
          onclick.includes("deleteUser")
        ) {
          btn.style.display = "none";
        }
      });
    }

    // ==========================================
    // 6. SPECIAL: COMPONENTS PAGE
    // ==========================================
    // Components page has both "Create Component" and "Assign Component" sections
    // Also hide assign if no create permission on components
    if (currentResource === "components" && !can("components", "create")) {
      // Hide the "Assign Component to Page" section
      document.querySelectorAll("h2").forEach(h2 => {
        if (h2.textContent.includes("Assign Component")) {
          h2.style.display = "none";
          let next = h2.nextElementSibling;
          while (next && next.tagName !== "H2") {
            next.style.display = "none";
            next = next.nextElementSibling;
          }
        }
      });
    }

    // ==========================================
    // 7. SPECIAL: REVIEWS PAGE
    // ==========================================
    // Reviews page has "Review Blocks" section — hide if no create on reviews
    if (currentResource === "reviews" && !can("reviews", "create")) {
      document.querySelectorAll("h2").forEach(h2 => {
        if (h2.textContent.includes("Review Blocks")) {
          h2.style.display = "none";
          let next = h2.nextElementSibling;
          while (next && next.tagName !== "H2") {
            next.style.display = "none";
            next = next.nextElementSibling;
          }
        }
      });
    }

  } catch (e) {
    console.error("Permission loader failed", e);
  }
});
