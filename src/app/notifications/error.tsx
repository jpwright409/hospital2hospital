"use client";
export default function Error({ reset }: { reset: () => void }) {
  return <div className="container page-section"><h1>Notifications unavailable</h1><p className="error" role="alert">Retry, or check the connection and apply migration 008 after 007. Demo data has not been substituted.</p><button className="button primary" onClick={reset}>Retry notifications</button></div>;
}
