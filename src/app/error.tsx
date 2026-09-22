"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="auth-main" style={{ minHeight: "100dvh" }}>
      <div className="auth-card">
        <h2>Something went wrong</h2>
        <p>The operation could not be completed. No secret values were exposed.</p>
        <button className="button" type="button" onClick={reset}>Try again</button>
      </div>
    </main>
  );
}
