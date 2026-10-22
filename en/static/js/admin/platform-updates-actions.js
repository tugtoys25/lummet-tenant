/* =========================================================
DELETE
========================================================= */

async function deletePlatformUpdate(id) {

if (!confirm(
"Delete this platform update permanently?"
)) {
return;
}

try {

const res = await fetch(
  "/en/api/v1/platform-updates/delete",
  {
    method: "POST",

    headers: {
      "Content-Type":
        "application/json"
    },

    body:
      JSON.stringify({
        id: Number(id)
      })
  }
);

const data =
  await res.json();

if (!res.ok || !data.success) {
  throw new Error(
    data.error ||
    "Delete failed."
  );
}

await loadPlatformUpdatesTable();

showPlatformUpdateAlert(
  "Platform update deleted.",
  "success"
);

} catch (error) {

console.error(
  "Platform update delete error:",
  error
);

showPlatformUpdateAlert(
  error.message ||
  "Failed to delete platform update.",
  "error"
);

}
}

/* =========================================================
CANCEL EDIT
========================================================= */

function cancelPlatformUpdateEdit() {
resetPlatformUpdateForm();
}

/* =========================================================
RESET FORM
========================================================= */

function resetPlatformUpdateForm() {

const form =
document.getElementById(
"platformUpdateForm"
);

if (!form) return;

form.reset();

clearUpdateFeaturedImage();

form.dataset.id = "";

const id =
form.querySelector(
"[name='id']"
);

if (id) {
id.value = "";
}

const title =
document.getElementById(
"updatesFormTitle"
);

if (title) {
title.textContent =
"Add Platform Update";
}

const submitBtn =
document.getElementById(
"platformUpdateSubmitBtn"
);

if (submitBtn) {
submitBtn.textContent =
"Create Update";
}

const cancelBtn =
document.getElementById(
"platformUpdateCancelBtn"
);

if (cancelBtn) {
cancelBtn.style.display =
"none";
}

const alertEl =
document.getElementById(
"platformUpdateFormAlert"
);

if (alertEl) {
alertEl.style.display =
"none";
}
}

/* =========================================================
ALERT
========================================================= */
function showPlatformUpdateAlert(message, type = "error") {
  const alertEl = document.getElementById(
    "platformUpdateFormAlert"
  );

  if (!alertEl) return;

  alertEl.className =
    type === "success"
      ? "alert alert--success"
      : "alert alert--error";

  alertEl.textContent = message;
  alertEl.style.display = "block";

  clearTimeout(window.platformUpdateAlertTimer);

  window.platformUpdateAlertTimer = setTimeout(() => {
    alertEl.style.display = "none";
  }, 5000);
}

/* =========================================================
DATETIME HELPER
========================================================= */

function formatDateTimeLocal(value) {

if (!value) return "";

const date =
new Date(value);

if (Number.isNaN(date.getTime())) {
return "";
}

const pad =
number =>
String(number).padStart(2, "0");

return (
date.getFullYear() +
"-" +
pad(date.getMonth() + 1) +
"-" +
pad(date.getDate()) +
"T" +
pad(date.getHours()) +
":" +
pad(date.getMinutes())
);
}
