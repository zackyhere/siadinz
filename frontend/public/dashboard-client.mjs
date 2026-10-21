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
  document.addEventListener("click", (event) => {
    const menu = event.target.closest(".skip-menu");
    closeSkipMenus(menu);
  });
  document.addEventListener("toggle", (event) => {
    if (event.target.matches(".skip-menu[open]")) closeSkipMenus(event.target);
  }, true);

  for (const button of document.querySelectorAll("[data-copy-code]")) {
    button.addEventListener("click", async () => {
      const source = button.previousElementSibling?.textContent?.trim();
      if (!source || !navigator.clipboard) return;
      try {
        await navigator.clipboard.writeText(source);
        button.textContent = "Tersalin";
        setTimeout(() => { button.textContent = "Salin"; }, 1200);
      } catch {}
    });
  }
})();`;