"use client";

import { useEffect, useState } from "react";

function generateId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function useAnonId() {
  const [anonId, setAnonId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const key = "newsreel_anon_id";
      let id = localStorage.getItem(key);
      if (!id) {
        id = generateId();
        localStorage.setItem(key, id);
      }
      setAnonId(id);
    } catch {
      setAnonId(generateId());
    }
  }, []);

  return anonId;
}
