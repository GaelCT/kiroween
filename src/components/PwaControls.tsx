"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

/** Registers offline support and shows an install button only when this browser can install the app. */
export function PwaControls() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    let disposed = false;
    let registration: ServiceWorkerRegistration | null = null;
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const installed = () => setInstallPrompt(null);
    const update = () => {
      void registration?.update().catch(() => {
        // The next normal navigation will retry the update.
      });
    };

    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", installed);
    window.addEventListener("online", update);
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((registered) => {
        if (!disposed) registration = registered;
      }).catch(() => {
        // Browsing still works when service workers are blocked; installation and offline reload do not.
      });
    }

    return () => {
      disposed = true;
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", installed);
      window.removeEventListener("online", update);
    };
  }, []);

  if (!installPrompt) return null;
  return (
    <button
      type="button"
      className="topbar-button install-button"
      onClick={async () => {
        const prompt = installPrompt;
        setInstallPrompt(null);
        try {
          await prompt.prompt();
          await prompt.userChoice;
        } catch {
          // A browser may invalidate a deferred prompt; a later beforeinstallprompt can offer it again.
        }
      }}
    >
      Install app
    </button>
  );
}
