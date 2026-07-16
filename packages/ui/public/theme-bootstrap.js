(() => {
  const root = document.documentElement;
  let preference = "system";
  try {
    const stored = window.localStorage.getItem("gamepulse-theme");
    if (stored === "light" || stored === "dark" || stored === "system") {
      preference = stored;
    }
  } catch {
    // System preference remains available when storage is blocked.
  }

  let systemDark = false;
  try {
    systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    // Light is the safe fallback when media queries are unavailable.
  }

  const theme = preference === "system"
    ? (systemDark ? "dark" : "light")
    : preference;
  root.dataset.theme = theme;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#171a1c" : "#e9eadf");
})();
