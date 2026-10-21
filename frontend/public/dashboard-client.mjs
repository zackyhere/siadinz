export const dashboardClientScript = `document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !["/skip", "/skip/cancel"].includes(form.getAttribute("action"))) return;
  event.preventDefault();
  const button = form.querySelector("button");
  if (!button || button.disabled) return;
  const previous = button.textContent;
  button.disabled = true;
  try {
    const response = await fetch(form.action, {
      method: "POST",
      body: new FormData(form),
      credentials: "same-origin",
      headers: { accept: "text/html" },
    });
    if (!response.ok) throw new Error("Skip request failed.");
    const skipped = form.getAttribute("action") === "/skip";
    form.setAttribute("action", skipped ? "/skip/cancel" : "/skip");
    button.textContent = skipped ? "Tidak jadi skip" : "Skip hari ini";
  } catch {
    button.textContent = previous;
  } finally {
    button.disabled = false;
  }
});`;
