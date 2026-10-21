export const dashboardClientScript = `(() => {
  const replayAnimation = (element) => {
    if (!element) return;
    element.style.animation = "none";
    void element.offsetWidth;
    element.style.animation = "";
  };
  const closeDialogOnBackdrop = (dialog) => dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  document.addEventListener("pointerdown", (event) => {
    for (const dialog of document.querySelectorAll("dialog[open]")) {
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    }
  }, true);

  const openDialog = (dialog) => {
    dialog?.showModal();
    replayAnimation(dialog);
  };
  const logoutDialog = document.querySelector("[data-logout-dialog]");
  if (logoutDialog) {
    closeDialogOnBackdrop(logoutDialog);
    document.querySelector("[data-open-logout]")?.addEventListener("click", () => openDialog(logoutDialog));
    document.querySelector("[data-close-logout]")?.addEventListener("click", () => logoutDialog.close());
  }

  for (const button of document.querySelectorAll("[data-open-settings]")) {
    button.addEventListener("click", () => openDialog(document.querySelector('[data-settings-dialog="' + button.dataset.openSettings + '"]')));
  }
  for (const button of document.querySelectorAll("[data-close-settings]")) {
    button.addEventListener("click", () => button.closest("dialog")?.close());
  }

  const closeSkipMenus = (except) => {
    for (const menu of document.querySelectorAll(".skip-menu[open]")) if (menu !== except) menu.open = false;
  };
  document.addEventListener("click", (event) => closeSkipMenus(event.target.closest(".skip-menu")));
  document.addEventListener("toggle", (event) => {
    if (event.target.matches(".skip-menu[open]")) {
      closeSkipMenus(event.target);
      replayAnimation(event.target.querySelector("form"));
    }
  }, true);

  for (const detail of document.querySelectorAll(".day-schedule")) {
    detail.addEventListener("toggle", () => {
      if (!detail.open) return;
      for (const sibling of document.querySelectorAll(".day-schedule[open]")) if (sibling !== detail) sibling.open = false;
      replayAnimation(detail.querySelector(".day-schedule__content"));
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