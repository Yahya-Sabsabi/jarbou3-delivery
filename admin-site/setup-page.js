(() => {
  const form = document.getElementById("canonical-setup-form");
  const password = document.getElementById("canonical-setup-password");
  const confirmation = document.getElementById("canonical-setup-confirmation");
  const errorBox = document.getElementById("canonical-setup-error");
  const saveButton = document.getElementById("canonical-setup-button");

  if (!(form instanceof HTMLFormElement) || !(password instanceof HTMLInputElement) || !(confirmation instanceof HTMLInputElement) || !(errorBox instanceof HTMLElement) || !(saveButton instanceof HTMLButtonElement)) return;

  const showError = (message) => {
    errorBox.textContent = message;
    errorBox.hidden = false;
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.hidden = true;
    if (password.value.length < 16) return showError("استخدم كلمة مرور بطول 16 حرفاً على الأقل.");
    if (password.value !== confirmation.value) return showError("كلمتا المرور غير متطابقتين.");

    saveButton.disabled = true;
    saveButton.textContent = "جارٍ حفظ كلمة المرور…";
    try {
      const response = await fetch("/admin/api/setup", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password.value, confirmation: confirmation.value }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 409) {
        window.location.replace("/admin");
        return;
      }
      if (!response.ok) throw new Error(payload.error || "SETUP_FAILED");
      window.location.replace("/admin");
    } catch {
      showError("تعذر حفظ كلمة المرور. أعد المحاولة.");
      saveButton.disabled = false;
      saveButton.textContent = "حفظ كلمة المرور وفتح الموقع";
    }
  });
})();
