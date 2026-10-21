export const dashboardClientScript = `(() => {
  const dialog = document.querySelector("[data-logout-dialog]");
  document.querySelector("[data-open-logout]")?.addEventListener("click", () => dialog?.showModal());
  document.querySelector("[data-close-logout]")?.addEventListener("click", () => dialog?.close());

  const notice = new URLSearchParams(location.search).get("notice");
  const permission = document.querySelector("[data-notification-permission]");
  const requestButton = document.querySelector("[data-request-notification]");
  const options = document.querySelector("[data-device-notification-options]");
  const storageKey = "device-notification-options";
  if (!permission || !requestButton || !options) {
    if (notice === "presensi" && "Notification" in window && Notification.permission === "granted") {
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
        if (saved.presensi) new Notification("Presensi berhasil", { body: "Status presensi telah dikonfirmasi oleh SiAdin." });
      } catch {}
    }
    return;
  }

  const refreshPermission = () => {
    if (!("Notification" in window)) {
      permission.textContent = "Notifikasi perangkat tidak didukung browser ini.";
      requestButton.disabled = true;
      return;
    }
    const state = Notification.permission;
    permission.textContent = state === "granted" ? "Notifikasi perangkat diizinkan." : state === "denied" ? "Izin notifikasi ditolak di browser." : "Notifikasi perangkat belum diizinkan.";
    requestButton.disabled = state !== "default";
    requestButton.textContent = state === "granted" ? "Notifikasi perangkat diizinkan" : state === "denied" ? "Izin notifikasi ditolak" : "Izinkan notifikasi perangkat";
  };
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
    for (const input of options.querySelectorAll("input[type=checkbox]")) input.checked = Boolean(saved[input.name]);
  } catch {}
  options.addEventListener("change", () => {
    const values = Object.fromEntries([...options.querySelectorAll("input[type=checkbox]")].map((input) => [input.name, input.checked]));
    localStorage.setItem(storageKey, JSON.stringify(values));
  });
  requestButton.addEventListener("click", async () => {
    if (!("Notification" in window) || Notification.permission !== "default") return;
    await Notification.requestPermission();
    refreshPermission();
  });
  refreshPermission();
})();`;