export const dashboardClientScript = `(() => {
  const storageKey = "device-notification-options";
  const eventCopy = {
    presensi: ["Presensi berhasil", "Status presensi telah dikonfirmasi oleh SiAdin."],
    skip: ["Presensi dilewati", "Mata kuliah hari ini tidak akan diproses oleh presensi otomatis."],
    unskip: ["Skip dibatalkan", "Mata kuliah hari ini kembali dapat diproses oleh presensi otomatis."],
    settings: ["Settings diperbarui", "Pengaturan dashboard berhasil disimpan."],
    apiPresensi: ["Aksi presensi API", "Permintaan presensi API telah diproses."],
    tokenRefresh: ["Token diperbarui", "Token SiAdin telah diperbarui."],
  };
  const deviceOptions = () => {
    try { return JSON.parse(localStorage.getItem(storageKey) || "{}"); } catch { return {}; }
  };
  const notify = (event) => {
    const copy = eventCopy[event];
    if (!copy || !("Notification" in window) || Notification.permission !== "granted" || !deviceOptions()[event]) return false;
    new Notification(copy[0], { body: copy[1] });
    return true;
  };

  const sendTestNotification = () => {
    if (!("Notification" in window) || Notification.permission !== "granted") return false;
    new Notification("Notifikasi perangkat aktif", { body: "Notifikasi percobaan berhasil dikirim." });
    return true;
  };

  const dialog = document.querySelector("[data-logout-dialog]");
  document.querySelector("[data-open-logout]")?.addEventListener("click", () => dialog?.showModal());
  document.querySelector("[data-close-logout]")?.addEventListener("click", () => dialog?.close());

  const notice = new URLSearchParams(location.search).get("notice");
  if (notice) notify(notice);

  const permission = document.querySelector("[data-notification-permission]");
  const requestButton = document.querySelector("[data-request-notification]");
  const testButton = document.querySelector("[data-test-notification]");
  const options = document.querySelector("[data-device-notification-options]");
  if (!permission || !requestButton || !options) return;

  const refreshPermission = () => {
    if (!("Notification" in window)) {
      permission.textContent = "Notifikasi perangkat tidak didukung browser ini.";
      requestButton.disabled = true;
      if (testButton) testButton.disabled = true;
      return;
    }
    const state = Notification.permission;
    permission.textContent = state === "granted" ? "Notifikasi perangkat diizinkan." : state === "denied" ? "Izin notifikasi ditolak di browser." : "Notifikasi perangkat belum diizinkan.";
    requestButton.disabled = state !== "default";
    if (testButton) testButton.disabled = state !== "granted";
    requestButton.textContent = state === "granted" ? "Notifikasi perangkat diizinkan" : state === "denied" ? "Izin notifikasi ditolak" : "Izinkan notifikasi perangkat";
  };
  for (const input of options.querySelectorAll("input[type=checkbox]")) input.checked = Boolean(deviceOptions()[input.name]);
  options.addEventListener("change", () => {
    const values = Object.fromEntries([...options.querySelectorAll("input[type=checkbox]")].map((input) => [input.name, input.checked]));
    localStorage.setItem(storageKey, JSON.stringify(values));
  });
  requestButton.addEventListener("click", async () => {
    if (!("Notification" in window) || Notification.permission !== "default") return;
    await Notification.requestPermission();
    refreshPermission();
  });
  testButton?.addEventListener("click", () => {
    try {
      if (sendTestNotification()) permission.textContent = "Notifikasi percobaan telah dikirim.";
      else permission.textContent = "Notifikasi belum diizinkan oleh browser.";
    } catch {
      permission.textContent = "Browser tidak dapat membuat notifikasi percobaan.";
    }
  });
  refreshPermission();
})();`;