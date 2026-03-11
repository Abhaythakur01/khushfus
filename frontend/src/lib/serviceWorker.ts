export function registerServiceWorker(): void {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    process.env.NODE_ENV !== "production"
  ) {
    return;
  }

  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      });

      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener("statechange", () => {
          if (
            newWorker.state === "activated" &&
            navigator.serviceWorker.controller
          ) {
            // New version available — could show a toast here
            console.info("[SW] New version available. Refresh to update.");
          }
        });
      });

      console.info("[SW] Registered successfully:", registration.scope);
    } catch (err) {
      console.warn("[SW] Registration failed:", err);
    }
  });
}

export function unregisterServiceWorker(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  navigator.serviceWorker.ready.then((registration) => {
    registration.unregister();
  });
}
