// =====================================================
// LOGIN & REGISTER FORMS
// =====================================================

document.addEventListener("DOMContentLoaded", () => {
  initLoginForm();
  initRegisterForm();
  initForgotPasswordForm();
  initResetPasswordForm();
  initNewsletterForms();
});

/**
 * Returns the ?redirect= param from the current URL if it's safe to
 * send the visitor to — either a same-site relative path (the normal
 * case), or an absolute URL back to this tenant's own `lummet.`
 * subdomain (the dedicated Lummet AI chat interface uses a different
 * origin, so its redirect back from /en/register or /en/login has to
 * be a full URL — this is the one absolute-URL case allowed, to avoid
 * turning this into an open redirect to arbitrary domains).
 * Returns null otherwise.
 */
function getSafeRedirectParam() {
  const value = new URLSearchParams(window.location.search).get("redirect");
  if (!value) return null;

  // Same-site relative path: single leading slash, no protocol-relative "//".
  if (/^\/(?!\/)/.test(value)) return value;

  // Absolute URL back to lummet.<this-hostname>, https only.
  try {
    const target = new URL(value);
    if (target.protocol === "https:" && target.hostname === `lummet.${window.location.hostname}`) {
      return target.href;
    }
  } catch {}

  return null;
}

// ---- Login ----
function initLoginFormbackup() {
  const form = document.getElementById("loginForm");
  if (!form) return;

  let loginTurnstileToken = "";

  window.onLoginTurnstileSuccess = function (token) {
    loginTurnstileToken = token || "";
  };

  window.onLoginTurnstileExpired = function () {
    loginTurnstileToken = "";
  };

  window.onLoginTurnstileError = function () {
    loginTurnstileToken = "";
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const errorEl =
      document.getElementById("loginError");

    errorEl.style.display = "none";

    const formData =
      new FormData(form);

    if (!loginTurnstileToken) {
      errorEl.textContent =
        "Please complete the security check.";

      errorEl.style.display = "block";
      return;
    }

    const payload = {
      email: formData.get("email"),
      password: formData.get("password"),
      "cf-turnstile-response":
        loginTurnstileToken
    };

    try {
      const res = await fetch(
        "/en/api/v1/auth/login",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body:
            JSON.stringify(payload)
        }
      );

      const data =
        await res.json();

      if (data.success) {
        window.location.href =
          "/en/dashboard";
        return;
      }

      errorEl.textContent =
        data.error || "Login failed";

      errorEl.style.display = "block";

      loginTurnstileToken = "";

      if (window.turnstile) {
        window.turnstile.reset();
      }

    } catch {
      errorEl.textContent =
        "Network error. Try again.";

      errorEl.style.display = "block";

      loginTurnstileToken = "";

      if (window.turnstile) {
        window.turnstile.reset();
      }
    }
  });
}


function initLoginForm() {
  const form = document.getElementById("loginForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("loginError");
    errorEl.style.display = "none";

    const formData = new FormData(form);
    const turnstileToken = formData.get("cf-turnstile-response") || 
      document.querySelector('[name="cf-turnstile-response"]')?.value;

    if (!turnstileToken) {
      errorEl.textContent = "Please complete the security check.";
      errorEl.style.display = "block";
      return;
    }

    const payload = {
      email: formData.get("email"),
      password: formData.get("password"),
      "cf-turnstile-response": turnstileToken,
    };

    try {
      const res = await fetch("/en/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        window.location.href = getSafeRedirectParam() || "/en/dashboard";
      } else {
        errorEl.textContent = data.error || "Login failed";
        errorEl.style.display = "block";
        // Reset Turnstile
        if (window.turnstile) window.turnstile.reset();
      }
    } catch {
      errorEl.textContent = "Network error. Try again.";
      errorEl.style.display = "block";
      if (window.turnstile) window.turnstile.reset();
    }
  });
}

// ---- Register ----

function initRegisterFormbackup() {
  const form =
    document.getElementById("registerForm");

  if (!form) return;

  let registerTurnstileToken = "";

  window.onRegisterTurnstileSuccess =
    function (token) {
      registerTurnstileToken =
        token || "";
    };

  window.onRegisterTurnstileExpired =
    function () {
      registerTurnstileToken = "";
    };

  window.onRegisterTurnstileError =
    function () {
      registerTurnstileToken = "";
    };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const errorEl =
      document.getElementById(
        "registerError"
      );

    errorEl.style.display = "none";

    const formData =
      new FormData(form);

    if (!registerTurnstileToken) {
      errorEl.textContent =
        "Please complete the security check.";

      errorEl.style.display = "block";
      return;
    }

    const payload = {
      email: formData.get("email"),
      password: formData.get("password"),
      "cf-turnstile-response":
        registerTurnstileToken
    };

    try {
      const res = await fetch(
        "/en/api/v1/auth/register",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body:
            JSON.stringify(payload)
        }
      );

      const data =
        await res.json();

      if (data.success) {
        window.location.href =
          "/en/login";
        return;
      }

      errorEl.textContent =
        data.error ||
        "Registration failed";

      errorEl.style.display =
        "block";

      registerTurnstileToken = "";

      if (window.turnstile) {
        window.turnstile.reset();
      }

    } catch {
      errorEl.textContent =
        "Network error. Try again.";

      errorEl.style.display =
        "block";

      registerTurnstileToken = "";

      if (window.turnstile) {
        window.turnstile.reset();
      }
    }
  });
}

function initRegisterForm() {
  const form = document.getElementById("registerForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("registerError");
    errorEl.style.display = "none";

    const formData = new FormData(form);
    const turnstileToken = formData.get("cf-turnstile-response") ||
      document.querySelector('[name="cf-turnstile-response"]')?.value;

    if (!turnstileToken) {
      errorEl.textContent = "Please complete the security check.";
      errorEl.style.display = "block";
      return;
    }

    const payload = {
      email: formData.get("email"),
      password: formData.get("password"),
      "cf-turnstile-response": turnstileToken,
    };

    try {
      const res = await fetch("/en/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        const redirect = getSafeRedirectParam();
        window.location.href = redirect
          ? `/en/login?redirect=${encodeURIComponent(redirect)}`
          : "/en/login";
      } else {
        errorEl.textContent = data.error || "Registration failed";
        errorEl.style.display = "block";
        if (window.turnstile) window.turnstile.reset();
      }
    } catch {
      errorEl.textContent = "Network error. Try again.";
      errorEl.style.display = "block";
      if (window.turnstile) window.turnstile.reset();
    }
  });
}

// =====================================================
// FORGOT PASSWORD / RESET PASSWORD
// =====================================================

function initForgotPasswordForm() {
  const form = document.getElementById("forgotPasswordForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("forgotPasswordError");
    const successEl = document.getElementById("forgotPasswordSuccess");
    errorEl.style.display = "none";
    successEl.style.display = "none";

    const formData = new FormData(form);
    const payload = { email: formData.get("email") };

    try {
      const res = await fetch("/en/api/v1/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        successEl.textContent = data.message || "If an account exists for that email, a reset link has been sent.";
        successEl.style.display = "block";
        form.reset();
      } else {
        errorEl.textContent = data.error || "Something went wrong. Please try again.";
        errorEl.style.display = "block";
      }
    } catch {
      errorEl.textContent = "Network error. Try again.";
      errorEl.style.display = "block";
    }
  });
}

function initResetPasswordForm() {
  const form = document.getElementById("resetPasswordForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("resetPasswordError");
    const successEl = document.getElementById("resetPasswordSuccess");
    errorEl.style.display = "none";
    successEl.style.display = "none";

    const formData = new FormData(form);
    const password = formData.get("password");
    const passwordConfirm = formData.get("passwordConfirm");

    if (password !== passwordConfirm) {
      errorEl.textContent = "Passwords do not match.";
      errorEl.style.display = "block";
      return;
    }

    const payload = {
      token: formData.get("token"),
      password,
    };

    if (!payload.token) {
      errorEl.textContent = "This reset link is missing its token. Please use the link from your email.";
      errorEl.style.display = "block";
      return;
    }

    try {
      const res = await fetch("/en/api/v1/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        successEl.textContent = "Your password has been reset. Redirecting to login…";
        successEl.style.display = "block";
        form.reset();
        setTimeout(() => { window.location.href = "/en/login"; }, 1500);
      } else {
        errorEl.textContent = data.error || "Could not reset password. The link may have expired.";
        errorEl.style.display = "block";
      }
    } catch {
      errorEl.textContent = "Network error. Try again.";
      errorEl.style.display = "block";
    }
  });
}

// =====================================================
// NEWSLETTER SUBSCRIBE
// =====================================================
// Supports multiple newsletter forms on one page (e.g. footer +
// an inline promo block) -- each just needs class="newsletter-form".

function initNewsletterForms() {
  const forms = document.querySelectorAll(".newsletter-form");
  if (!forms.length) return;

  forms.forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const messageEl = form.querySelector(".newsletter-message");
      const submitBtn = form.querySelector('button[type="submit"]');
      const formData = new FormData(form);
      const email = formData.get("email");

      if (messageEl) {
        messageEl.style.display = "none";
        messageEl.className = "newsletter-message";
      }
      if (submitBtn) submitBtn.disabled = true;

      try {
        const res = await fetch("/en/api/v1/newsletter/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();

        if (messageEl) {
          messageEl.textContent = data.success
            ? (data.message || "Check your email to confirm your subscription.")
            : (data.error || "Something went wrong. Please try again.");
          messageEl.className = "newsletter-message " + (data.success ? "newsletter-message--success" : "newsletter-message--error");
          messageEl.style.display = "block";
        }
        if (data.success) form.reset();
      } catch {
        if (messageEl) {
          messageEl.textContent = "Network error. Try again.";
          messageEl.className = "newsletter-message newsletter-message--error";
          messageEl.style.display = "block";
        }
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  });
}
