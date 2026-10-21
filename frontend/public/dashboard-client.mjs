export const dashboardClientScript = `(() => {
  const closeDialogOnBackdrop = (dialog) => dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  document.addEventListener("pointerdown", (event) => {
    for (const dialog of document.querySelectorAll("dialog[open]")) {
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    }
  }, true);

  const logoutDialog = document.querySelector("[data-logout-dialog]");
  if (logoutDialog) {
    closeDialogOnBackdrop(logoutDialog);
    document.querySelector("[data-open-logout]")?.addEventListener("click", () => logoutDialog.showModal());
    document.querySelector("[data-close-logout]")?.addEventListener("click", () => logoutDialog.close());
  }

  for (const button of document.querySelectorAll("[data-open-settings]")) {
    button.addEventListener("click", () => document.querySelector('[data-settings-dialog="' + button.dataset.openSettings + '"]')?.showModal());
  }
  for (const button of document.querySelectorAll("[data-close-settings]")) {
    button.addEventListener("click", () => button.closest("dialog")?.close());
  }

  const closeSkipMenus = (except) => {
    for (const menu of document.querySelectorAll(".skip-menu[open]")) if (menu !== except) menu.open = false;
  };
  document.addEventListener("click", (event) => closeSkipMenus(event.target.closest(".skip-menu")));
  document.addEventListener("toggle", (event) => {
    if (event.target.matches(".skip-menu[open]")) closeSkipMenus(event.target);
  }, true);

  for (const detail of document.querySelectorAll(".day-schedule")) {
    detail.addEventListener("toggle", () => {
      if (detail.open) for (const sibling of document.querySelectorAll(".day-schedule[open]")) if (sibling !== detail) sibling.open = false;
    });
  }

  const csrf = document.querySelector("[data-api-copy-csrf]")?.dataset.apiCopyCsrf;
  for (const button of document.querySelectorAll("[data-copy-code]")) {
    button.addEventListener("click", async () => {
      if (!csrf || !navigator.clipboard) return;
      button.disabled = true;
      try {
        const response = await fetch("/copy-api-command", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": "same-origin" }, body: new URLSearchParams({ csrf, template: button.dataset.apiTemplate }) });
        if (!response.ok) throw new Error("Copy failed.");
        await navigator.clipboard.writeText(await response.text());
        button.textContent = "Tersalin";
      } catch {
        button.textContent = "Gagal menyalin";
      } finally {
        setTimeout(() => { button.textContent = "Salin"; button.disabled = false; }, 1200);
      }
    });
  }
})();`;