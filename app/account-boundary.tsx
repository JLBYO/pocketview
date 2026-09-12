"use client";

import { useEffect, useState, type ReactNode } from "react";

export default function AccountBoundary({ children }: { children: ReactNode }) {
    const [status, setStatus] = useState<"checking" | "ready" | "locked" | "unavailable">("checking");
    const [opened, setOpened] = useState(false);
    useEffect(() => {
        let active = true, checking = false;
        const verify = async () => {
            if (checking) return;
            checking = true;
            try {
                const response = await fetch("/auth/session", { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(12000) });
                const body: unknown = response.ok ? await response.json() : null;
                const authenticated = Boolean(body && typeof body === "object" && "authenticated" in body && body.authenticated === true);
                if (active) { setStatus(authenticated ? "ready" : response.status === 401 ? "locked" : "unavailable"); if (authenticated) setOpened(true); }
            } catch { if (active) setStatus("unavailable"); }
            finally { checking = false; }
        };
        void verify();
        const timer = window.setInterval(() => { if (document.visibilityState === "visible") void verify(); }, 60000);
        const onFocus = () => { void verify(); };
        window.addEventListener("focus", onFocus);
        return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
    }, []);
    return <>
        {status !== "ready" && <section className="accountLock" aria-labelledby="account-lock-heading"><span className="brandmark">P</span><h1 id="account-lock-heading">{status === "checking" ? "Opening Your Private Workspace…" : status === "locked" ? "Please Sign In Again" : "We Could Not Check Your Sign-In"}</h1><p role="status">{status === "checking" ? "Checking your Personal Life Assistant account." : "Your saved local history has not been erased. If you have unsaved drafts, signing in in another tab and returning here lets Pocketview check your session again."}</p>{status !== "checking" && <a href="/login" target="_blank" rel="noopener noreferrer">Open Sign-In</a>}</section>}
        {opened && <div hidden={status !== "ready"}>{children}</div>}
    </>;
}
