"use client";

import { useEffect, useState } from "react";

export function Toast({ toast }: { toast: { id: number; text: string } | null }) {
  const [shown, setShown] = useState<{ id: number; text: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    setShown(toast);
    const t = setTimeout(() => setShown((s) => (s?.id === toast.id ? null : s)), 2400);
    return () => clearTimeout(t);
  }, [toast]);
  return (
    <div className="toast" style={{ opacity: shown ? 1 : 0 }} aria-live="polite">
      {shown?.text ?? ""}
    </div>
  );
}
