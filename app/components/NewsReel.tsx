"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useAnonId } from "@/app/hooks/useAnonId";
import { formatDistanceToNow } from "date-fns";
import { CATEGORY_META } from "@/lib/categories";
import { Logo, LogoMark } from "@/app/components/Logo";
import {
  Cpu,
  Rocket,
  Building2,
  Shield,
  Smartphone,
  TrendingUp,
  Bitcoin,
  Wallet,
  Landmark,
  Handshake,
  Heart,
  Share2,
  ChevronDown,
  Settings,
  X,
  Moon,
  Sun,
  Monitor,
  Type,
  Play,
  Pause,
  Volume2,
  VolumeX,
  SkipForward,
  Globe,
  Clock,
  Check,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { fallbackImageUrl } from "@/lib/images";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Cpu,
  Rocket,
  Building2,
  Shield,
  Smartphone,
  TrendingUp,
  Bitcoin,
  Wallet,
  Landmark,
  Handshake,
};

type CategoryMeta = Record<string, { icon: string; chart: number }>;

type Article = {
  id: number;
  title: string;
  link: string;
  source: string;
  published_at: string;
  summary: string;
  tldr_bullets: string[];
  content?: string;
  image_url: string | null;
  image_is_fallback: boolean;
  categories: { category: string; score: number }[];
  final_score: number;
  liked: boolean;
};

type AppSettings = {
  theme: "light" | "dark" | "system";
  fontSize: "small" | "medium" | "large";
  autoScroll: { enabled: boolean; speed: "slow" | "normal" | "fast" };
  readAloudSpeed: number;
  readAloudVoice: string;
};

const DEFAULT_SETTINGS: AppSettings = {
  theme: "system",
  fontSize: "medium",
  autoScroll: { enabled: false, speed: "normal" },
  readAloudSpeed: 1,
  readAloudVoice: "",
};

const SPEEDS = [0.75, 1, 1.25, 1.5];

const AUTO_SCROLL_MS: Record<string, number> = { slow: 12000, normal: 8000, fast: 5000 };

// Breathing room between two spoken headlines.
const READ_ALOUD_GAP_MS = 900;

/**
 * Full-bleed card artwork. If the real image fails or is missing we swap to a
 * stable per-category stock photo, then fall back to the on-brand gradient.
 */
function CardImage({
  imageUrl,
  category,
  title,
  priority,
}: {
  imageUrl: string | null;
  category?: string;
  title?: string;
  priority: boolean;
}) {
  const fallback = fallbackImageUrl(category || "", title || "");
  const [src, setSrc] = useState(imageUrl || fallback);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(src ? "loading" : "error");

  useEffect(() => {
    const next = imageUrl || fallback;
    setSrc(next);
    setStatus(next ? "loading" : "error");
  }, [imageUrl, category, title]);

  const m = CATEGORY_META[(category as keyof typeof CATEGORY_META) || "AI"] || { icon: "Cpu", chart: 1 };
  const chart = m.chart;
  const Icon = ICONS[m.icon];

  return (
    // z-0 (not a negative z-index): a negative z-index would paint this layer
    // behind the opaque page background and the photo would never be visible.
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
      {/* Base: category gradient, always painted so a missing photo still looks on-brand */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(150deg, hsl(var(--chart-${chart})) 0%, hsl(var(--background)) 85%)`,
        }}
      />

      {/* Watermark icon, only visible when there is no usable photo */}
      {status === "error" && Icon && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon className="w-56 h-56 text-white/10" />
        </div>
      )}

      {/* Shimmer while the photo is still downloading */}
      {status === "loading" && <div className="absolute inset-0 skeleton opacity-30" />}

      {src && status !== "error" && (
        <img
          src={src}
          alt=""
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${
            status === "loaded" ? "opacity-100" : "opacity-0"
          }`}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          onLoad={(e) => setStatus(e.currentTarget.naturalWidth > 0 ? "loaded" : "error")}
          onError={() => {
            // Try the category stock photo once, then give up and show the gradient.
            if (src !== fallback) setSrc(fallback);
            else setStatus("error");
          }}
        />
      )}

      {/* Single full-bleed scrim: top slightly dark for the header icons, bottom
          heavy so the headline and summary stay readable over any photo. */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/25 to-black/90" />
      {/* Extra solid base under the copy block — guarantees contrast even when
          the lower half of the photo is bright (snow, sky, white studio shots). */}
      <div className="absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-black via-black/85 to-transparent" />
    </div>
  );
}

const FONT_SCALES: Record<string, string> = { small: "0.9", medium: "1", large: "1.15" };

function generateId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function saveLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function loadLocal(key: string, fallback = "") {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function applyTheme(theme: AppSettings["theme"]) {
  const root = document.documentElement;
  if (
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  ) {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

function applyFontSize(size: AppSettings["fontSize"]) {
  document.documentElement.style.setProperty("--font-scale", FONT_SCALES[size]);
}

export function NewsReel({ articleId }: { articleId?: string } = { articleId: undefined }) {
  const anonId = useAnonId();
  const [categories, setCategories] = useState<string[]>([]);
  const [meta, setMeta] = useState<CategoryMeta>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [hasOnboarded, setHasOnboarded] = useState(false);
  const [feed, setFeed] = useState<Article[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedError, setFeedError] = useState("");
  const [readerOpen, setReaderOpen] = useState(false);
  const [readerArticle, setReaderArticle] = useState<Article | null>(null);
  const [readerMode, setReaderMode] = useState<"tldr" | "full">(
    (loadLocal("newsreel_reader_mode", "tldr") as "tldr") || "tldr"
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [toast, setToast] = useState("");
  const [autoScrollPaused, setAutoScrollPaused] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const isSpeakingRef = useRef(false);
  const [readAloudAutoPlay, setReadAloudAutoPlay] = useState(false);
  const [readerLoading, setReaderLoading] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [lastLikedId, setLastLikedId] = useState<number | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const autoScrollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTap = useRef<number>(0);
  const lastSpokenTitle = useRef("");
  const scrollLockUntil = useRef(0);
  const loadingMore = useRef(false);
  const gapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data) => {
        setCategories(data.categories);
        setMeta(data.meta || {});
      });
  }, []);

  useEffect(() => {
    if (!anonId) return;
    const stored = loadLocal("newsreel_categories");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSelected(parsed);
        setHasOnboarded(true);
      } catch {}
    }
    fetch(`/api/preferences?anonId=${anonId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.categories?.length) {
          setSelected(data.categories);
          setHasOnboarded(true);
        }
        const merged = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
        setSettings(merged);
      });
  }, [anonId]);

  const loadFeed = useCallback(async () => {
    if (!anonId || selected.length === 0) return;
    setLoading(true);
    setFeedError("");
    try {
      const qs = new URLSearchParams({
        anonId: anonId!,
        categories: selected.map(encodeURIComponent).join(","),
      });
      const res = await fetch(`/api/feed?${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Feed failed");
      setFeed(data.articles);
      setNextCursor(data.nextCursor ?? null);
      if (articleId) {
        const found = data.articles.find((a: Article) => String(a.id) === articleId);
        if (found) {
          openReader(found);
        } else {
          fetchArticle(articleId);
        }
      }
    } catch (e: any) {
      setFeedError(e.message);
    } finally {
      setLoading(false);
    }
  }, [anonId, selected, articleId]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  // Appends the next page. Returns how many new articles were added so
  // read-aloud/auto-scroll can decide whether to keep going.
  const loadMore = useCallback(async (): Promise<number> => {
    if (!anonId || selected.length === 0) return 0;
    if (nextCursor === null || loadingMore.current) return 0;
    loadingMore.current = true;
    try {
      const qs = new URLSearchParams({
        anonId: anonId!,
        categories: selected.map(encodeURIComponent).join(","),
        cursor: String(nextCursor),
      });
      const res = await fetch(`/api/feed?${qs}`);
      const data = await res.json();
      if (!res.ok) return 0;
      const fresh: Article[] = data.articles || [];
      let added = 0;
      setFeed((prev) => {
        const seen = new Set(prev.map((a) => a.id));
        const unique = fresh.filter((a) => !seen.has(a.id));
        added = unique.length;
        return unique.length ? [...prev, ...unique] : prev;
      });
      setNextCursor(data.nextCursor ?? null);
      return added || fresh.length;
    } catch {
      return 0;
    } finally {
      loadingMore.current = false;
    }
  }, [anonId, selected, nextCursor]);

  // Prefetch the next page as the user nears the end of the loaded feed.
  useEffect(() => {
    if (nextCursor !== null && feed.length - activeIndex <= 3) loadMore();
  }, [activeIndex, feed.length, nextCursor, loadMore]);

  useEffect(() => {
    applyTheme(settings.theme);
    saveLocal("newsreel_theme", settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    applyFontSize(settings.fontSize);
  }, [settings.fontSize]);

  useEffect(() => {
    saveLocal("newsreel_reader_mode", readerMode);
  }, [readerMode]);

  async function syncPreferences(updates?: Partial<AppSettings>) {
    if (!anonId) return;
    const body: any = { anonId, categories: selected };
    if (updates) body.settings = updates;
    await fetch("/api/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function savePreferences(cats: string[]) {
    if (!anonId) return;
    if (cats.length === 0) return;
    setSelected(cats);
    saveLocal("newsreel_categories", JSON.stringify(cats));
    await fetch("/api/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anonId, categories: cats }),
    });
    setHasOnboarded(true);
    setSettingsOpen(false);
  }

  async function updateSettings(updates: Partial<AppSettings>) {
    const next = { ...settings, ...updates };
    setSettings(next);
    await syncPreferences(updates);
  }

  async function toggleLike(article: Article, e?: React.MouseEvent) {
    e?.stopPropagation();
    if (!anonId) return;

    const res = await fetch("/api/like", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anonId, articleId: article.id }),
    });
    if (res.ok) {
      const data = await res.json();
      setFeed((prev) =>
        prev.map((a) => (a.id === article.id ? { ...a, liked: data.liked } : a))
      );
      setLastLikedId(data.liked ? article.id : null);
      if (data.liked) {
        setTimeout(() => setLastLikedId(null), 700);
      }
      stopSpeech();
    }
  }

  function handleDoubleTap(article: Article, e: React.MouseEvent) {
    e.stopPropagation();
    const now = Date.now();
    if (now - lastTap.current < 350) {
      toggleLike(article);
    }
    lastTap.current = now;
  }

  async function openReader(article: Article) {
    setReaderOpen(true);
    setReaderLoading(true);
    setReaderArticle(article);
    stopSpeech();
    pauseAutoScroll();
    const res = await fetch(`/api/article/${article.id}`);
    if (res.ok) {
      const data = await res.json();
      setReaderArticle(data.article);
    }
    setReaderLoading(false);
  }

  async function fetchArticle(id: string) {
    setReaderLoading(true);
    setReaderOpen(true);
    const res = await fetch(`/api/article/${id}`);
    if (res.ok) {
      const data = await res.json();
      setReaderArticle(data.article);
    }
    setReaderLoading(false);
  }

  async function shareArticle(article: Article, e: React.MouseEvent) {
    e.stopPropagation();
    const url = `${window.location.origin}/article/${article.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: article.title, url });
      } else {
        await copyToClipboard(url);
        showToast("Link copied");
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        await copyToClipboard(url);
        showToast("Link copied");
      }
    }
  }

  function copyLink(article: Article, e?: React.MouseEvent) {
    e?.stopPropagation();
    const url = `${window.location.origin}/article/${article.id}`;
    copyToClipboard(url).then(() => showToast("Link copied")).catch(() => showToast("Could not copy"));
  }

  async function copyToClipboard(text: string) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } finally {
      document.body.removeChild(ta);
    }
  }

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(""), 2000);
  }

  function toggleCategory(c: string) {
    setSelected((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  }

  function toggleAll() {
    setSelected((prev) => (prev.length === categories.length ? [] : [...categories]));
  }

  const allSelected = selected.length === categories.length;

  const CategoryIcon = ({ name }: { name: string }) => {
    const Comp = ICONS[name];
    return Comp ? <Comp className="w-4 h-4" /> : null;
  };

  function renderChipSelector(
    value: string[],
    onChange: (v: string[]) => void,
    showAll = true
  ) {
    return (
      <div className="flex flex-wrap gap-3 mt-4">
        {showAll && (
          <button
            onClick={() => onChange(value.length === categories.length ? [] : [...categories])}
            className={`px-4 py-2 rounded-full border text-sm font-medium transition flex items-center gap-2 ${
              value.length === categories.length
                ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-transparent"
                : "bg-transparent text-[hsl(var(--muted-foreground))] border-[hsl(var(--border))]"
            }`}
          >
            <Globe className="w-4 h-4" />
            All Topics
          </button>
        )}
        {categories.map((c) => {
          const active = value.includes(c);
          const m = meta[c] || { icon: "Cpu", chart: 1 };
          return (
            <button
              key={c}
              onClick={() =>
                onChange(active ? value.filter((x) => x !== c) : [...value, c])
              }
              className={`px-4 py-2 rounded-full border text-sm font-medium transition flex items-center gap-2 ${
                active
                  ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-transparent"
                  : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] border-transparent hover:bg-[hsl(var(--muted)/0.7)]"
              }`}
            >
              <CategoryIcon name={m.icon} />
              {c}
              {active && <Check className="w-3 h-3 ml-1" />}
            </button>
          );
        })}
      </div>
    );
  }

  // Scrolls to a card programmatically and suppresses the intermediate
  // onScroll events that smooth-scrolling emits (they briefly report the
  // previous index and would restart read-aloud on the same card).
  function goToIndex(next: number) {
    const el = feedRef.current;
    if (!el) return;
    scrollLockUntil.current = Date.now() + 1000;
    setActiveIndex(next);
    el.scrollTo({ top: next * el.clientHeight, behavior: "smooth" });
  }

  // Auto-scroll
  function pauseAutoScroll() {
    setAutoScrollPaused(true);
    if (autoScrollTimer.current) {
      clearInterval(autoScrollTimer.current);
      autoScrollTimer.current = null;
    }
  }

  function resumeAutoScroll() {
    if (!settings.autoScroll.enabled || readerOpen) return;
    setAutoScrollPaused(false);
  }

  useEffect(() => {
    if (!settings.autoScroll.enabled || autoScrollPaused || readerOpen || feed.length === 0 || readAloudAutoPlay) {
      if (autoScrollTimer.current) clearInterval(autoScrollTimer.current);
      return;
    }
    autoScrollTimer.current = setInterval(() => {
      setActiveIndex((idx) => {
        if (idx >= feed.length - 1) {
          // Keep going until the user stops it: fetch the next page.
          loadMore().then((added) => {
            if (added === 0) {
              pauseAutoScroll();
              showToast("You're all caught up");
            }
          });
          return idx;
        }
        const next = idx + 1;
        scrollLockUntil.current = Date.now() + 1000;
        feedRef.current?.scrollTo({ top: next * feedRef.current.clientHeight, behavior: "smooth" });
        return next;
      });
    }, AUTO_SCROLL_MS[settings.autoScroll.speed]);

    return () => {
      if (autoScrollTimer.current) clearInterval(autoScrollTimer.current);
    };
  }, [settings.autoScroll, autoScrollPaused, readerOpen, feed.length, readAloudAutoPlay, loadMore]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        pauseAutoScroll();
        setReadAloudAutoPlay(false);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // ---------- Read aloud ----------
  const ttsSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    if (!ttsSupported) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ttsSupported]);

  // Chrome silently stops long utterances after ~15s unless pinged.
  useEffect(() => {
    if (!ttsSupported || !isSpeaking) return;
    const tick = setInterval(() => {
      const s = window.speechSynthesis;
      if (s.speaking && !s.paused) {
        s.pause();
        s.resume();
      }
    }, 10000);
    return () => clearInterval(tick);
  }, [ttsSupported, isSpeaking]);

  function selectedVoice(): SpeechSynthesisVoice | undefined {
    if (!settings.readAloudVoice) return undefined;
    return voices.find((v) => v.voiceURI === settings.readAloudVoice);
  }

  function stopSpeech() {
    if (!ttsSupported) return;
    window.speechSynthesis.cancel();
    isSpeakingRef.current = false;
    setIsSpeaking(false);
  }

  // Speaks a one-off passage (reader view). Does not advance the feed.
  function speak(text: string) {
    if (!ttsSupported || !text) return;
    setReadAloudAutoPlay(false);
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    const voice = selectedVoice();
    if (voice) utter.voice = voice;
    utter.rate = settings.readAloudSpeed;
    utter.onend = () => {
      isSpeakingRef.current = false;
      setIsSpeaking(false);
    };
    utter.onerror = () => {
      isSpeakingRef.current = false;
      setIsSpeaking(false);
    };
    isSpeakingRef.current = true;
    setIsSpeaking(true);
    setTimeout(() => window.speechSynthesis.speak(utter), 60);
  }

  // Single controller: whenever auto-play is on, read the active headline and
  // advance to the next card when it finishes.
  useEffect(() => {
    if (!ttsSupported) return;

    if (!readAloudAutoPlay) {
      window.speechSynthesis.cancel();
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      lastSpokenTitle.current = "";
      return;
    }

    const article = feed[activeIndex];
    if (!article || readerOpen) return;
    if (lastSpokenTitle.current === article.title) return;

    lastSpokenTitle.current = article.title;
    pauseAutoScroll();
    window.speechSynthesis.cancel();

    let cancelled = false;
    const utter = new SpeechSynthesisUtterance(article.title);
    const voice = selectedVoice();
    if (voice) utter.voice = voice;
    utter.rate = settings.readAloudSpeed;

    // Short breath between stories so headlines don't run together.
    const finish = () => {
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      if (cancelled) return;
      gapTimer.current = setTimeout(async () => {
        if (cancelled) return;
        const next = activeIndex + 1;
        if (next < feed.length) {
          goToIndex(next);
          return;
        }
        // Keep playing until the user turns it off: pull the next page.
        const added = await loadMore();
        if (cancelled) return;
        if (added > 0) goToIndex(next);
        else {
          setReadAloudAutoPlay(false);
          showToast("You're all caught up");
        }
      }, READ_ALOUD_GAP_MS);
    };

    utter.onend = finish;
    utter.onerror = (e) => {
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      if (!cancelled && e.error !== "interrupted" && e.error !== "canceled") {
        setReadAloudAutoPlay(false);
        showToast("Read aloud unavailable");
      }
    };

    isSpeakingRef.current = true;
    setIsSpeaking(true);
    const timer = setTimeout(() => window.speechSynthesis.speak(utter), 80);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (gapTimer.current) clearTimeout(gapTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readAloudAutoPlay, activeIndex, feed, readerOpen, ttsSupported, loadMore]);

  function toggleReadAloud() {
    if (!ttsSupported) {
      showToast("Read aloud not supported in this browser");
      return;
    }
    if (feed.length === 0) {
      showToast("No stories to read yet");
      return;
    }
    lastSpokenTitle.current = "";
    setReadAloudAutoPlay((v) => !v);
  }

  function toggleAutoScroll() {
    const enabled = !settings.autoScroll.enabled;
    updateSettings({ autoScroll: { ...settings.autoScroll, enabled } });
    setAutoScrollPaused(!enabled);
  }

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return;

      if (e.key === "Escape") {
        if (settingsOpen) setSettingsOpen(false);
        else if (readerOpen) {
          setReaderOpen(false);
          setReaderArticle(null);
        }
        return;
      }
      if (readerOpen || settingsOpen) return;

      const key = e.key.toLowerCase();
      if (key === "r" || e.code === "Space") {
        e.preventDefault();
        toggleReadAloud();
      } else if (key === "a") {
        e.preventDefault();
        toggleAutoScroll();
      } else if (key === "l") {
        e.preventDefault();
        if (feed[activeIndex]) toggleLike(feed[activeIndex]);
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        pauseAutoScroll();
        setReadAloudAutoPlay(false);
        const next = Math.min(Math.max(activeIndex + (e.key === "ArrowDown" ? 1 : -1), 0), feed.length - 1);
        goToIndex(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed, activeIndex, readerOpen, settingsOpen, settings, ttsSupported]);

  const supportsShare = typeof navigator !== "undefined" && !!navigator.share;

  if (!categories.length) {
    return (
      <div className="h-full w-full flex items-center justify-center text-[hsl(var(--muted-foreground))]">
        <div className="w-10 h-10 border-2 border-[hsl(var(--muted))] border-t-[hsl(var(--foreground))] rounded-full animate-spin" />
      </div>
    );
  }

  if (!hasOnboarded) {
    return (
      <div className="h-full w-full flex flex-col p-6 pt-20 pb-10 overflow-y-auto bg-[hsl(var(--background))]">
        <div className="flex items-center gap-3 mb-6 text-[hsl(var(--foreground))]">
          <LogoMark className="h-12 w-auto text-[hsl(var(--brand))] shrink-0" />
          <div className="flex flex-col leading-none">
            <h1 className="text-[26px] font-extrabold tracking-tight">KATCHUP</h1>
            <span className="text-[10px] font-medium tracking-[0.22em] opacity-60 mt-1">
              NEWS REELS
            </span>
          </div>
        </div>
        <p className="text-[hsl(var(--muted-foreground))] mb-2">
          Pick the topics you care about to start swiping through today’s news.
        </p>
        {renderChipSelector(selected, setSelected)}
        <div className="flex-1" />
        <button
          onClick={() => savePreferences(selected)}
          disabled={selected.length === 0}
          className="w-full py-4 rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold text-lg disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Continue
        </button>
      </div>
    );
  }

  return (
    <div className="h-full w-full relative bg-[hsl(var(--background))]">
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4">
        {/* Mark only on mobile; the wordmark appears from sm up. Always white
            here because it sits on the photo overlay, not on the page bg. */}
        <Logo className="text-white drop-shadow-lg" />
        <div className="flex items-center gap-2">
          <button
            data-testid="read-aloud-toggle"
            onClick={toggleReadAloud}
            title="Read aloud (R)"
            className={`h-9 w-9 rounded-full backdrop-blur flex items-center justify-center shadow-lg transition ${
              readAloudAutoPlay
                ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                : "bg-black/60 text-white"
            }`}
            aria-pressed={readAloudAutoPlay}
            aria-label="Read aloud auto play"
          >
            {readAloudAutoPlay ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>

          <button
            data-testid="auto-scroll-toggle"
            onClick={() => {
              if (!settings.autoScroll.enabled) toggleAutoScroll();
              else if (autoScrollPaused) resumeAutoScroll();
              else pauseAutoScroll();
            }}
            title="Auto-scroll (A)"
            className={`h-9 w-9 rounded-full backdrop-blur flex items-center justify-center shadow-lg transition ${
              settings.autoScroll.enabled && !autoScrollPaused
                ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                : "bg-black/60 text-white"
            }`}
            aria-pressed={settings.autoScroll.enabled && !autoScrollPaused}
            aria-label="Auto scroll"
          >
            {settings.autoScroll.enabled && !autoScrollPaused ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5" />
            )}
          </button>

          <button
            onClick={() => setSettingsOpen(true)}
            className="h-9 w-9 rounded-full bg-black/60 backdrop-blur text-white flex items-center justify-center shadow-lg"
            aria-label="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {loading && feed.length === 0 ? (
        <div className="h-full w-full p-4 flex flex-col gap-4 justify-center">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-[80vh] rounded-2xl w-full max-w-xl mx-auto skeleton"
            />
          ))}
        </div>
      ) : feedError ? (
        <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center text-[hsl(var(--muted-foreground))]">
          <p className="mb-4">{feedError}</p>
          <button
            onClick={loadFeed}
            className="px-4 py-2 rounded-full border border-[hsl(var(--border))]"
          >
            Retry
          </button>
        </div>
      ) : feed.length === 0 ? (
        <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center">
          <p className="text-xl font-semibold mb-2 text-[hsl(var(--foreground))]">No stories yet</p>
          <p className="text-[hsl(var(--muted-foreground))] mb-6">
            Try adding more topics or check back once today’s news has been ingested.
          </p>
          <button
            onClick={() => setSettingsOpen(true)}
            className="px-6 py-3 rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold"
          >
            Edit topics
          </button>
        </div>
      ) : (
        <div
          ref={feedRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            if (!el.clientHeight) return;
            if (Date.now() < scrollLockUntil.current) return;
            const idx = Math.round(el.scrollTop / el.clientHeight);
            const clamped = Math.min(Math.max(idx, 0), Math.max(feed.length - 1, 0));
            setActiveIndex((prev) => (prev === clamped ? prev : clamped));
          }}
          onPointerDown={() => pauseAutoScroll()}
          className="h-full w-full overflow-y-auto snap-y snap-mandatory no-scrollbar"
        >
          {feed.map((article, idx) => (
            <div
              key={article.id}
              data-card={article.id}
              className="h-full w-full snap-start relative overflow-hidden isolate"
              style={{ touchAction: "manipulation" }}
              onDoubleClick={(e) => handleDoubleTap(article, e)}
              onClick={(e) => {
                if (e.detail === 2) handleDoubleTap(article, e);
              }}
            >
              <CardImage
                imageUrl={article.image_url}
                category={article.categories[0]?.category}
                title={article.title}
                priority={Math.abs(idx - activeIndex) <= 1}
              />

              {lastLikedId === article.id && (
                <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
                  <Heart className="w-24 h-24 text-rose-500 fill-rose-500 heart-burst" />
                </div>
              )}

              {/* Action rail — bare icons with a drop shadow (TikTok style) so
                  they read as one column instead of disjoint pill patches. */}
              <div className="absolute right-2 bottom-14 flex flex-col items-center gap-6 z-20">
                <button
                  onClick={(e) => toggleLike(article, e)}
                  className="p-2 text-white drop-shadow-lg hover:scale-110 active:scale-95 transition"
                  aria-label="Like"
                >
                  <Heart
                    className={`w-7 h-7 ${article.liked ? "fill-rose-500 text-rose-500" : ""}`}
                  />
                </button>
                <button
                  onClick={(e) => shareArticle(article, e)}
                  className="p-2 text-white drop-shadow-lg hover:scale-110 active:scale-95 transition"
                  aria-label="Share"
                >
                  <Share2 className="w-7 h-7" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openReader(article);
                  }}
                  className="p-2 text-white drop-shadow-lg hover:scale-110 active:scale-95 transition"
                  aria-label="View More"
                >
                  <ChevronDown className="w-7 h-7" />
                </button>
              </div>

              {/* Text content floats over the full-bleed image, like TikTok.
                  No background of its own — CardImage already paints the scrim,
                  so there is no visible rectangle edge. pr-20 keeps the copy
                  clear of the action rail. */}
              <div className="absolute bottom-0 left-0 right-0 px-6 pb-10 pr-20 text-white z-10">
                <div className="flex flex-wrap gap-2 mb-3">
                  {article.categories.slice(0, 3).map((c) => (
                    <span
                      key={c.category}
                      className="px-2 py-1 text-xs rounded-md bg-white/20 backdrop-blur"
                    >
                      {c.category} · {Math.round(c.score * 100)}%
                    </span>
                  ))}
                </div>
                <h2 className="text-2xl sm:text-4xl font-bold leading-tight tracking-tight mb-3 text-white text-legible">
                  {article.title}
                </h2>

                {/* AI summary: prefer the Gemini TL;DR bullets (far more scannable
                    in a reel) and fall back to the prose summary. */}
                {article.tldr_bullets?.length ? (
                  <div className="mb-4">
                    <div className="flex items-center gap-1.5 mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/70">
                      <Sparkles className="w-3.5 h-3.5" />
                      AI Summary
                    </div>
                    <ul className="space-y-1.5">
                      {article.tldr_bullets.slice(0, 3).map((b, i) => (
                        <li key={i} className="flex gap-2.5 text-[15px] sm:text-base leading-snug text-white text-legible">
                          {/* Brand red: --primary and every --chart-* token is a
                              dark slate that disappears against the scrim. */}
                          <span className="mt-[7px] w-1.5 h-1.5 rounded-full shrink-0 bg-[hsl(var(--brand))]" />
                          {/* No clamp: these are already short TL;DR lines, so
                              truncating them just hides the point. */}
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-white text-[15px] sm:text-lg leading-relaxed mb-4 line-clamp-4 text-legible">
                    {article.summary}
                  </p>
                )}

                <div className="flex items-center gap-2 text-sm text-white/85 text-legible">
                  <span className="font-semibold">{article.source}</span>
                  <span>·</span>
                  <span>
                    {formatDistanceToNow(new Date(article.published_at), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
              </div>

              {idx === activeIndex && (
                <div className="absolute top-1/2 right-3 -translate-y-1/2 z-20">
                  {isSpeaking && (
                    <Volume2 className="w-5 h-5 text-white/70 animate-pulse" />
                  )}
                </div>
              )}
            </div>
          ))}
          <div className="h-full w-full flex flex-col items-center justify-center gap-2 text-[hsl(var(--muted-foreground))] p-6 text-center">
            {nextCursor !== null ? (
              <>
                <div className="w-8 h-8 border-2 border-[hsl(var(--primary))] border-t-transparent rounded-full animate-spin" />
                <p className="text-sm">Loading more stories…</p>
              </>
            ) : (
              <>
                <p className="font-medium">You’re all caught up.</p>
                <p className="text-sm opacity-70">Pull up or refresh for the latest.</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* No fixed bottom progress UI — users just scroll. */}

      {/* Reader */}
      <AnimatePresence>
        {readerOpen && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-40 bg-[hsl(var(--background))] flex flex-col"
          >
            <div className="flex items-center justify-between p-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
              <button
                onClick={() => {
                  setReaderOpen(false);
                  setReaderArticle(null);
                  resumeAutoScroll();
                }}
                className="text-[hsl(var(--foreground))] font-semibold"
              >
                ← Back
              </button>
              <span className="text-[hsl(var(--muted-foreground))] text-sm">Reader</span>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {readerLoading || !readerArticle ? (
                <div className="space-y-4">
                  <div className="h-48 w-full rounded-xl skeleton" />
                  <div className="h-8 w-3/4 rounded skeleton" />
                  <div className="h-4 w-1/2 rounded skeleton" />
                  <div className="h-32 w-full rounded skeleton" />
                </div>
              ) : (
                <article className="max-w-2xl mx-auto">
                  <div className="relative w-full h-64 rounded-xl overflow-hidden mb-6">
                    <CardImage
                      imageUrl={readerArticle.image_url}
                      category={readerArticle.categories[0]?.category}
                      title={readerArticle.title}
                      priority={true}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2 mb-4">
                    {readerArticle.categories.map((c) => (
                      <span
                        key={c.category}
                        className="px-2 py-1 text-xs rounded-md bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]"
                      >
                        {c.category} · {Math.round(c.score * 100)}%
                      </span>
                    ))}
                  </div>

                  <h1 className="text-2xl sm:text-3xl font-bold mb-4 text-[hsl(var(--foreground))]">
                    {readerArticle.title}
                  </h1>

                  <div className="flex items-center justify-between text-sm text-[hsl(var(--muted-foreground))] mb-6">
                    <span>{readerArticle.source}</span>
                    <span>
                      {formatDistanceToNow(new Date(readerArticle.published_at), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mb-6">
                    <button
                      onClick={() => setReaderMode("tldr")}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                        readerMode === "tldr"
                          ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                          : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
                      }`}
                    >
                      TLDR
                    </button>
                    <button
                      onClick={() => setReaderMode("full")}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                        readerMode === "full"
                          ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                          : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
                      }`}
                    >
                      Full Read
                    </button>
                  </div>

                  <div className="prose prose-invert max-w-none leading-relaxed text-[hsl(var(--foreground))]">
                    {readerMode === "tldr" ? (
                      readerArticle.tldr_bullets?.length ? (
                        <ul className="list-disc pl-5 space-y-2">
                          {readerArticle.tldr_bullets.map((b, i) => (
                            <li key={i}>{b}</li>
                          ))}
                        </ul>
                      ) : readerArticle.content ? (
                        <p className="text-[hsl(var(--muted-foreground))]">
                          TLDR not available for this article. Switched to Full Read.
                        </p>
                      ) : (
                        <p className="text-[hsl(var(--muted-foreground))]">No content available.</p>
                      )
                    ) : readerArticle.content ? (
                      <div className="whitespace-pre-wrap">{readerArticle.content}</div>
                    ) : (
                      // Full text is dropped by the retention job on older
                      // articles; the summary and TLDR are kept.
                      <p className="text-[hsl(var(--muted-foreground))]">
                        {readerArticle.summary}
                        <br />
                        <br />
                        The full text of this story is no longer stored. Use the link below to read it
                        at the source.
                      </p>
                    )}
                  </div>

                  <a
                    href={readerArticle.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-8 text-[hsl(var(--foreground))] underline underline-offset-4"
                  >
                    Read original source →
                  </a>

                  <div className="flex items-center gap-3 mt-8">
                    <button
                      onClick={() => toggleLike(readerArticle)}
                      className={`flex-1 py-3 rounded-full font-semibold transition ${
                        readerArticle.liked
                          ? "bg-rose-500 text-white"
                          : "bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]"
                      }`}
                    >
                      <Heart className={`w-5 h-5 inline mr-2 ${readerArticle.liked ? "fill-white" : ""}`} />
                      {readerArticle.liked ? "Liked" : "Like"}
                    </button>
                    <button
                      onClick={() => copyLink(readerArticle)}
                      className="flex-1 py-3 rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold"
                    >
                      <Share2 className="w-5 h-5 inline mr-2" />
                      Copy link
                    </button>
                    <button
                      data-testid="reader-read-aloud"
                      onClick={() => {
                        if (!ttsSupported) {
                          showToast("Read aloud not supported in this browser");
                          return;
                        }
                        if (isSpeaking) {
                          stopSpeech();
                          return;
                        }
                        const text =
                          readerMode === "tldr"
                            ? (readerArticle.tldr_bullets || []).join(". ")
                            : readerArticle.content || readerArticle.summary || "";
                        if (!text.trim()) {
                          showToast("Nothing to read here");
                          return;
                        }
                        speak(`${readerArticle.title}. ${text}`);
                      }}
                      className="px-4 py-3 rounded-full bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]"
                      aria-label="Read aloud"
                    >
                      {isSpeaking ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                    </button>
                  </div>
                </article>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings / Preferences */}
      <AnimatePresence>
        {settingsOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur flex items-end sm:items-center justify-center"
            onClick={() => setSettingsOpen(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="w-full sm:w-[480px] max-h-[90vh] overflow-y-auto bg-[hsl(var(--background))] rounded-t-2xl sm:rounded-2xl p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-[hsl(var(--foreground))]">Settings</h2>
                <button onClick={() => setSettingsOpen(false)} className="text-[hsl(var(--muted-foreground))]">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <section className="mb-8">
                <h3 className="text-sm font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wide mb-3">
                  Topics
                </h3>
                {renderChipSelector(selected, setSelected)}
                <button
                  onClick={() => savePreferences(selected)}
                  disabled={selected.length === 0}
                  className="w-full mt-6 py-3 rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold disabled:opacity-40"
                >
                  Save topics
                </button>
              </section>

              <section className="space-y-6">
                <h3 className="text-sm font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wide mb-3">
                  Appearance & Reading
                </h3>

                <div>
                  <label className="block text-[hsl(var(--foreground))] font-medium mb-2">Theme</label>
                  <div className="flex gap-2">
                    {(["light", "dark", "system"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => updateSettings({ theme: t })}
                        className={`flex-1 py-2 rounded-full text-sm font-medium border transition flex items-center justify-center gap-1 ${
                          settings.theme === t
                            ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-transparent"
                            : "bg-[hsl(var(--card))] text-[hsl(var(--foreground))] border-[hsl(var(--border))]"
                        }`}
                      >
                        {t === "light" && <Sun className="w-4 h-4" />}
                        {t === "dark" && <Moon className="w-4 h-4" />}
                        {t === "system" && <Monitor className="w-4 h-4" />}
                        <span className="capitalize">{t}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[hsl(var(--foreground))] font-medium mb-2">Font size</label>
                  <div className="flex gap-2">
                    {(["small", "medium", "large"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => updateSettings({ fontSize: s })}
                        className={`flex-1 py-2 rounded-full text-sm font-medium border transition ${
                          settings.fontSize === s
                            ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-transparent"
                            : "bg-[hsl(var(--card))] text-[hsl(var(--foreground))] border-[hsl(var(--border))]"
                        }`}
                      >
                        <Type className="w-4 h-4 inline mr-1" />
                        <span className="capitalize">{s}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[hsl(var(--foreground))] font-medium">Auto-scroll</label>
                    <button
                      onClick={() =>
                        updateSettings({
                          autoScroll: { ...settings.autoScroll, enabled: !settings.autoScroll.enabled },
                        })
                      }
                      className={`w-12 h-6 rounded-full transition ${
                        settings.autoScroll.enabled ? "bg-[hsl(var(--primary))]" : "bg-[hsl(var(--muted))]"
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full bg-white transform transition ${
                          settings.autoScroll.enabled ? "translate-x-6" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] mb-3">
                    Off by default. Pauses on any interaction.
                  </p>
                  {settings.autoScroll.enabled && (
                    <div className="flex gap-2">
                      {(["slow", "normal", "fast"] as const).map((s) => (
                        <button
                          key={s}
                          onClick={() =>
                            updateSettings({
                              autoScroll: { ...settings.autoScroll, speed: s },
                            })
                          }
                          className={`flex-1 py-2 rounded-full text-xs font-medium border transition ${
                            settings.autoScroll.speed === s
                              ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-transparent"
                              : "bg-[hsl(var(--card))] text-[hsl(var(--foreground))] border-[hsl(var(--border))]"
                          }`}
                        >
                          <Clock className="w-3 h-3 inline mr-1" />
                          <span className="capitalize">{s}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[hsl(var(--foreground))] font-medium mb-2">Read-aloud speed</label>
                  <div className="flex gap-2">
                    {SPEEDS.map((s) => (
                      <button
                        key={s}
                        onClick={() => updateSettings({ readAloudSpeed: s })}
                        className={`flex-1 py-2 rounded-full text-sm font-medium border transition ${
                          settings.readAloudSpeed === s
                            ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-transparent"
                            : "bg-[hsl(var(--card))] text-[hsl(var(--foreground))] border-[hsl(var(--border))]"
                        }`}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                </div>

                {voices.length > 0 && (
                  <div>
                    <label className="block text-[hsl(var(--foreground))] font-medium mb-2">Read-aloud voice</label>
                    <select
                      value={settings.readAloudVoice}
                      onChange={(e) => updateSettings({ readAloudVoice: e.target.value })}
                      className="w-full py-2 px-3 rounded-xl bg-[hsl(var(--card))] text-[hsl(var(--foreground))] border border-[hsl(var(--border))]"
                    >
                      <option value="">Default system voice</option>
                      {voices.map((v) => (
                        <option key={v.voiceURI} value={v.voiceURI}>
                          {v.name} {v.lang ? `(${v.lang})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </section>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-[hsl(var(--foreground))] text-[hsl(var(--background))] text-sm font-medium"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
