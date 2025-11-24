// File: app/(contest)/live/[contestId]/page.tsx
// or wherever your LiveContestPage lives

"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  orderBy,
  addDoc,
  serverTimestamp,
  setDoc,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import type { Contest, Question } from "@/lib/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import Editor from "@monaco-editor/react";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Clock, Code, CheckCircle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Local path to the generated image you uploaded.
 * Developer note: you asked to include the file path so it can be transformed into a URL by your tooling.
 */
const GENERATED_IMAGE_PATH = "/mnt/data/A_compilation_of_three_high-resolution_digital_pho.png";

/* ---------------------------
   (Helpers, input parsing, code runner, etc.)
   Paste your original helper implementations here unchanged.
   I include the helpers you previously provided (sanitizeParamName, generateDefaultCode,
   parseSampleInputToArgs, runCode, buildWrapperForLanguage, etc.)
   (Full helper code included verbatim below)
   --------------------------- */

/* ---------------------------
   Fallback defaults for compiled langs
   --------------------------- */
const fallbackDefaultCode: Record<string, string> = {
  cpp: `#include <bits/stdc++.h>
using namespace std;

int solve(vector<int> input){
    // write your logic here
}`,
  c: `#include <stdio.h>

int solve(int input[], int size){
    // write your logic here
}`,
  java: `import java.util.*;

public class Main {
    public static int solve(List<Integer> input) {
        // write your logic here
    }
}`,
};

function sanitizeParamName(name?: string, idx = 0) {
  if (!name) return `p${idx + 1}`;
  let s = String(name).trim();
  try {
    s = s.replace(/[^\p{L}\p{N}_]+/gu, "_").replace(/^_+|_+$/g, "");
  } catch {
    s = s.replace(/[^a-zA-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  }
  if (/^[0-9]/.test(s)) s = "_" + s;
  if (!s) return `p${idx + 1}`;
  return s;
}
function mapTypeToJsDoc(type?: string) {
  if (!type) return "any";
  const t = type.toLowerCase();
  if (t === "int" || t === "long" || t === "number") return "number";
  if (t === "float" || t === "double") return "number";
  if (t === "string") return "string";
  if (t === "bool" || t === "boolean") return "boolean";
  if (t === "array" || t === "list") return "Array";
  return "any";
}
function mapTypeToPythonHint(type?: string) {
  if (!type) return "Any";
  const t = type.toLowerCase();
  if (t === "int" || t === "long" || t === "number") return "int";
  if (t === "float" || t === "double") return "float";
  if (t === "string") return "str";
  if (t === "bool" || t === "boolean") return "bool";
  if (t === "array" || t === "list") return "list";
  return "Any";
}
function generateDefaultCode(language: string, inputsMeta: any[] = []) {
  const params =
    inputsMeta && inputsMeta.length > 0
      ? inputsMeta.map((m: any, i: number) => sanitizeParamName(m?.name, i))
      : ["input"];

  if (language === "javascript") {
    const jsdocLines = ["/**"];
    for (let i = 0; i < params.length; i++) {
      const t = mapTypeToJsDoc(inputsMeta?.[i]?.type);
      jsdocLines.push(` * @param {${t}} ${params[i]}`);
    }
    jsdocLines.push(" * @returns {any}");
    jsdocLines.push(" */");
    const jsdoc = jsdocLines.join("\n");
    return `${jsdoc}
function solve(${params.join(", ")}) {
  // write your logic here
}`;
  }

  if (language === "python") {
    const needAny = inputsMeta?.some((m: any) => !m?.type);
    const imports = needAny ? "from typing import Any\n\n" : "";
    const paramHints = params
      .map((p, i) => `${p}: ${mapTypeToPythonHint(inputsMeta?.[i]?.type)}`)
      .join(", ");
    return `${imports}def solve(${paramHints}):
    \"\"\"Write your solution here.\"\"\" 
    # write your logic here `;
  }

  if (language === "cpp") return fallbackDefaultCode.cpp;
  if (language === "c") return fallbackDefaultCode.c;
  if (language === "java") return fallbackDefaultCode.java;

  return `function solve(${params.join(", ")}) {
  // write your logic here
}`;
}

function parseTokenToValue(token: string, type?: string) {
  const t = (type || "").toLowerCase();
  if (t === "int" || t === "long" || t === "number") {
    if (/^-?\d+$/.test(token)) return parseInt(token, 10);
    const n = Number(token);
    return Number.isFinite(n) ? Math.trunc(n) : token;
  }
  if (t === "float" || t === "double") {
    const n = Number(token);
    return Number.isFinite(n) ? n : token;
  }
  if (t === "bool" || t === "boolean") {
    if (/^(true|1)$/i.test(token)) return true;
    if (/^(false|0)$/i.test(token)) return false;
    return Boolean(token);
  }
  if (t === "string") {
    return token;
  }
  if (t === "array" || t === "list") {
    const trimmed = token.trim();
    if (/^[\[\{].*[\]\}]$/.test(trimmed)) {
      try {
        return JSON.parse(trimmed);
      } catch {}
    }
    return trimmed === "" ? [] : trimmed.split(/\s+/);
  }
  try {
    return JSON.parse(token);
  } catch {
    return token;
  }
}
function toJSLiteral(value: any) {
  return JSON.stringify(value);
}
function toPythonLiteral(value: any) {
  if (value === null) return "None";
  if (Array.isArray(value) || typeof value === "object") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    const escaped = value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    return `'${escaped}'`;
  }
  if (typeof value === "boolean") return value ? "True" : "False";
  return String(value);
}
function parseSampleInputToArgs(sampleInputStr: string, inputsMeta: any[] = []) {
  const s = (sampleInputStr ?? "").trim();
  if (s === "") {
    return inputsMeta.map((m) => parseTokenToValue(String(m?.example ?? ""), m?.type));
  }

  if (/^[\[\{].*[\]\}]$/.test(s)) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed) && inputsMeta.length > 1) {
        return inputsMeta.map((m, i) => {
          const v = parsed[i];
          if (v === undefined) return parseTokenToValue(String(m?.example ?? ""), m?.type);
          return parseTokenToValue(String(v), m?.type);
        });
      } else if (inputsMeta.length === 1) {
        return [parsed];
      } else {
        return [parsed];
      }
    } catch {}
  }

  let tokens = s.split(/\s+/);
  if (tokens.length === 1 && s.includes(",") && !s.includes(" ")) {
    tokens = s.split(",").map((x) => x.trim()).filter(Boolean);
  }

  if (tokens.length > inputsMeta.length && inputsMeta.length > 0) {
    const first = tokens.slice(0, inputsMeta.length - 1);
    const last = tokens.slice(inputsMeta.length - 1).join(" ");
    tokens = first.concat([last]);
  }

  if (inputsMeta && inputsMeta.length > 0) {
    return inputsMeta.map((m, i) => {
      const token = tokens[i] ?? String(m?.example ?? "");
      return parseTokenToValue(String(token), m?.type);
    });
  }

  return tokens.map((t) => {
    const n = Number(t);
    return Number.isFinite(n) ? n : t;
  });
}

async function runCode(language: string, code: string, stdin = "") {
  const res = await fetch("/api/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language, code, stdin }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Execution failed");
  return data;
}
const extractOutputFromPiston = (result: any) => {
  const run = result?.run ?? result;
  const out = run?.output ?? run?.stdout ?? run?.stderr ?? "";
  return String(out ?? "");
};

function getSamplePairsFromQuestion(q: Question) {
  const inputsArr: string[] = Array.isArray((q as any).sampleInputs)
    ? (q as any).sampleInputs
    : (typeof (q as any).sampleInput === "string" ? [(q as any).sampleInput] : []);
  const outputsArr: string[] = Array.isArray((q as any).sampleOutputs)
    ? (q as any).sampleOutputs
    : (typeof (q as any).sampleOutput === "string" ? [(q as any).sampleOutput] : []);
  while (outputsArr.length < inputsArr.length) outputsArr.push("");
  return { inputsArr, outputsArr };
}

function buildWrapperForLanguage(
  lang: string,
  userCode: string,
  sampleInputStr: string,
  inputsMeta: any[] = []
) {
  const args = parseSampleInputToArgs(sampleInputStr, inputsMeta);
  const paramNames =
    inputsMeta && inputsMeta.length > 0
      ? inputsMeta.map((m: any, idx: number) => sanitizeParamName(m?.name, idx))
      : args.map((_, idx) => String.fromCharCode(97 + idx)); // a, b, c

  if (lang === "javascript") {
    const declarations = paramNames
      .map((name, i) => `const ${name} = ${toJSLiteral(args[i])};`)
      .join("\n");
    const callArgs = paramNames.join(", ");
    const wrapped = `\n${userCode}\n${declarations}\nconsole.log(JSON.stringify(solve(${callArgs})));`;
    return { code: wrapped, stdin: "" };
  }

  if (lang === "python") {
    const needJson = args.some((a) => typeof a === "object" && a !== null);
    const imports = needJson ? "import json\n" : "";
    const declarations = args
      .map((a, i) => {
        const name = paramNames[i];
        if (typeof a === "object" && a !== null) {
          const jsonStr = JSON.stringify(a).replace(/'/g, "\\'");
          return `${name} = json.loads('${jsonStr}')`;
        }
        return `${name} = ${toPythonLiteral(a)}`;
      })
      .join("\n");
    const callArgs = paramNames.join(", ");
    const wrapped = `\n${imports}${userCode}\n${declarations}\nprint(solve(${callArgs}))\n`;
    return { code: wrapped, stdin: "" };
  }

  // compiled languages: pass stdin directly and assume user code reads input
  return { code: userCode, stdin: sampleInputStr };
}

/* ---------------------------
   UI Component (full)
   --------------------------- */

type TestResult = {
  index: number;
  input: string;
  expected: string;
  actual: string | null;
  passed: boolean;
  error?: string | null;
};

function solvedStorageKey(contestId: string, userId?: string) {
  return `contest_solved:${contestId}:${userId ?? "anon"}`;
}
function loadSolvedFromLocal(contestId: string, userId?: string) {
  try {
    const raw = localStorage.getItem(solvedStorageKey(contestId, userId));
    if (!raw) return [] as string[];
    return JSON.parse(raw) as string[];
  } catch {
    return [] as string[];
  }
}
function saveSolvedToLocal(contestId: string, userId: string | undefined, solvedArr: string[]) {
  try {
    localStorage.setItem(solvedStorageKey(contestId, userId), JSON.stringify(solvedArr));
  } catch {}
}

export default function LiveContestPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const levelParam = searchParams?.get("level");
  const selectedLevel = levelParam === "other" ? "other" : levelParam ? Number(levelParam) : null;
  const { user } = useAuth();
  const { toast } = useToast();
  const contestId = params.contestId as string;

  const [contest, setContest] = useState<Contest | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [activeQuestion, setActiveQuestion] = useState<Question | null>(null);
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("javascript");
  const [output, setOutput] = useState("Run your code to see output here.");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [solved, setSolved] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("output");
  const [isContestOver, setIsContestOver] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[] | null>(null);

  const levelOrder = [1, 2, 3];
  const groupedQuestions = levelOrder.map((lvl) => ({
    level: lvl,
    items: questions.filter((q) => Number(q?.level) === lvl),
  }));
  const otherQuestions = questions.filter((q) => !levelOrder.includes(Number(q?.level)));

  const lockContest = useCallback(async () => {
    if (!user || isContestOver) return;
    setIsContestOver(true);
    await setDoc(
      doc(db, `user_contests/${user.uid}_${contestId}`),
      { status: "ended", endedAt: serverTimestamp() },
      { merge: true }
    );
  }, [contestId, user, isContestOver]);

  const handleTimeUp = useCallback(async () => {
    toast({ title: "Time's Up!", description: "Contest ended." });
    await lockContest();
    router.replace("/dashboard");
  }, [lockContest, router, toast]);

  useEffect(() => {
    if (!contestId) return;
    (async () => {
      setIsLoading(true);
      try {
        const cSnap = await getDoc(doc(db, "contests", contestId));
        if (!cSnap.exists()) return router.replace("/dashboard");
        setContest({ id: cSnap.id, ...(cSnap.data() as any) } as Contest);

        const qSnap = await getDocs(
          query(collection(db, `contests/${contestId}/questions`), orderBy("level"))
        );
        const list = qSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Question[];

        let filtered: Question[] = list;
        if (selectedLevel !== null) {
          if (selectedLevel === "other") {
            filtered = list.filter((q) => ![1, 2, 3].includes(Number(q?.level)));
          } else {
            filtered = list.filter((q) => Number(q?.level) === Number(selectedLevel));
          }
        }

        setQuestions(filtered);
        if (filtered.length) setActiveQuestion(filtered[0]);

        const localSolved = loadSolvedFromLocal(contestId, user?.uid);
        if (localSolved && localSolved.length) setSolved(localSolved);
      } catch (err) {
        console.error(err);
        toast({ variant: "destructive", title: "Error", description: "Failed to load contest." });
      } finally {
        setIsLoading(false);
      }
    })();
  }, [contestId, router, toast, selectedLevel, user?.uid]);

  useEffect(() => {
    const inputsMeta = Array.isArray(activeQuestion?.inputs) ? activeQuestion!.inputs : [];
    const generated = generateDefaultCode(language, inputsMeta);
    setCode(generated);
  }, [language, activeQuestion]);

  //
  // IMPORTANT: single tabId shared by heartbeat & proctoring
  //
  const sharedTabIdRef = { current: "" } as { current: string };
  useEffect(() => {
    if (!sharedTabIdRef.current) {
      sharedTabIdRef.current =
        typeof crypto !== "undefined" && (crypto as any).randomUUID
          ? (crypto as any).randomUUID()
          : `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    }
  }, []); // run once

  // --- NEW: prevent Backspace navigation except when editing ---
  useEffect(() => {
    const isEditable = (el: EventTarget | null) => {
      if (!el || !(el instanceof Element)) return false;
      const tag = el.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return true;
      // contenteditable attribute
      if ((el as Element).closest && (el as Element).closest("[contenteditable='true'], [contenteditable='']")) return true;
      // Monaco editor container (allow backspace when focused inside the monaco editor)
      if ((el as Element).closest && (el as Element).closest(".monaco-editor")) return true;
      return false;
    };

    const onKeyDownGlobal = (e: KeyboardEvent) => {
      // Only handle Backspace
      if (e.key !== "Backspace") return;
      if (isEditable(e.target)) return; // allow deletion in inputs / editor
      // Prevent browser's default back-navigation behavior
      e.preventDefault();
      try {
        toast?.({ title: "Action blocked", description: "Backspace won't navigate away during the contest." });
      } catch {}
    };

    // use capture so we intercept before browser handles navigation
    window.addEventListener("keydown", onKeyDownGlobal, { capture: true });

    return () => {
      window.removeEventListener("keydown", onKeyDownGlobal, { capture: true });
    };
    // intentionally depends on toast so that toast is in scope
  }, [toast]);

  // Heartbeat + BroadcastChannel
  useEffect(() => {
    if (!contestId || !user) return;

    const tabId = sharedTabIdRef.current;
    const HEARTBEAT_INTERVAL_MS = 5000; // 5s
    const PRESENCE_CHANNEL = "contest-presence";
    const PRESENCE_PREFIX = `contest_presence:${contestId}:${user.uid}:`;

    let heartbeatTimer: number | null = null;
    let bc: BroadcastChannel | null = null;

    const sendHeartbeat = async () => {
      try {
        const idToken = typeof (user as any).getIdToken === "function" ? await (user as any).getIdToken() : null;
        await fetch("/api/heartbeat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          },
          body: JSON.stringify({ contestId, userId: user.uid, tabId }),
          keepalive: true,
        });
      } catch (err) {
        console.error("heartbeat failed", err);
      }
    };

    const announceOpen = () => {
      try {
        if (typeof BroadcastChannel !== "undefined") {
          if (!bc) bc = new BroadcastChannel(PRESENCE_CHANNEL);
          bc.postMessage({ type: "open", contestId, userId: user.uid, tabId, ts: Date.now() });
        } else {
          localStorage.setItem(PRESENCE_PREFIX + tabId, JSON.stringify({ type: "open", ts: Date.now(), tabId }));
        }
      } catch (e) {}
    };

    const onBeforeUnload = () => {
      try {
        const payload = JSON.stringify({ contestId, userId: user.uid, tabId });
        if (navigator.sendBeacon) {
          navigator.sendBeacon("/api/heartbeat-end", payload);
        } else {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/heartbeat-end", false);
          xhr.setRequestHeader("Content-Type", "application/json");
          xhr.send(payload);
        }
      } catch (e) {}
    };

    const onBcMessage = async (ev: MessageEvent) => {
      try {
        const msg = ev.data;
        if (!msg || msg.contestId !== contestId) return;
        if (msg.userId === user.uid && msg.tabId !== tabId) {
          toast({
            title: "Another tab detected",
            description: "This contest is also open in another tab. Locking contest and disabling this tab.",
          });
          setIsContestOver(true);
          try { await lockContest(); } catch (e) { console.error(e); }
          router.replace("/dashboard");
        }
      } catch (e) {
        console.error(e);
      }
    };

    const onStorage = async (ev: StorageEvent) => {
      if (!ev.key) return;
      try {
        if (ev.key.startsWith(PRESENCE_PREFIX) && ev.newValue) {
          const parsed = JSON.parse(ev.newValue);
          if (parsed && parsed.tabId && parsed.tabId !== tabId) {
            toast({
              title: "Another tab detected (storage)",
              description: "Locking contest and disabling this tab.",
            });
            setIsContestOver(true);
            try { await lockContest(); } catch (e) { console.error(e); }
            router.replace("/dashboard");
          }
        }
      } catch (e) {
        console.error(e);
      }
    };

    announceOpen();
    sendHeartbeat();
    heartbeatTimer = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    try {
      if (typeof BroadcastChannel !== "undefined") {
        bc = new BroadcastChannel(PRESENCE_CHANNEL);
        bc.addEventListener("message", onBcMessage);
      } else {
        window.addEventListener("storage", onStorage);
      }
    } catch (e) {
      window.addEventListener("storage", onStorage);
    }

    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      try {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (bc) {
          bc.postMessage({ type: "close", contestId, userId: user.uid, tabId, ts: Date.now() });
          bc.removeEventListener("message", onBcMessage);
          bc.close();
        } else {
          localStorage.removeItem(PRESENCE_PREFIX + tabId);
          window.removeEventListener("storage", onStorage);
        }
        window.removeEventListener("beforeunload", onBeforeUnload);
        try {
          const payload = JSON.stringify({ contestId, userId: user.uid, tabId });
          if (navigator.sendBeacon) navigator.sendBeacon("/api/heartbeat-end", payload);
        } catch (e) {}
      } catch (e) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contestId, user]);

  // Proctoring listeners (re-uses sharedTabIdRef.current)
  useEffect(() => {
    if (!contestId || !user) return;
    const tabId = sharedTabIdRef.current;

    const MAX_VIOLATIONS = 3;
    const RESIZE_THRESHOLD_PX = 150;
    const MAX_FAST_RESIZES = 3;
    const FAST_RESIZE_WINDOW_MS = 5000;

    let violationCount = 0;
    let lastVisibilityHiddenAt: number | null = null;
    let resizeEvents: number[] = [];
    let closed = false;

    const sendViolationToServer = async (type: string, detail?: string) => {
      try {
        const idToken = typeof (user as any).getIdToken === "function" ? await (user as any).getIdToken() : null;
        await fetch("/api/violation", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          },
          body: JSON.stringify({
            contestId,
            userId: user.uid,
            tabId,
            type,
            detail,
            ts: Date.now(),
          }),
          keepalive: true,
        });
      } catch (err) {
        console.error("violation log failed", err);
      }
    };

    const incrViolation = async (type: string, detail?: string) => {
      violationCount += 1;
      try {
        toast({
          title: "Suspicious activity detected",
          description: `${type} ${violationCount >= MAX_VIOLATIONS ? "- locking contest" : `(violation ${violationCount}/${MAX_VIOLATIONS})`}`,
        });
      } catch {}
      await sendViolationToServer(type, detail);

      if (violationCount >= MAX_VIOLATIONS) {
        try {
          setIsContestOver(true);
          await lockContest();
        } catch (e) {
          console.error("lockContest on violation failed", e);
        } finally {
          try { router.replace("/dashboard"); } catch {}
        }
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        lastVisibilityHiddenAt = Date.now();
        incrViolation("visibility_hidden", "Tab became hidden or minimized");
      } else {
        const leftFor = lastVisibilityHiddenAt ? Date.now() - lastVisibilityHiddenAt : 0;
        lastVisibilityHiddenAt = null;
        sendViolationToServer("visibility_return", `leftForMs:${leftFor}`);
      }
    };

    const onBlur = () => { incrViolation("window_blur", "Window lost focus (blur)"); };
    const onFocus = () => { sendViolationToServer("window_focus", "Window regained focus"); };

    const onMouseOut = (ev: MouseEvent) => {
      const e = ev as MouseEvent & { relatedTarget?: EventTarget | null };
      if (!e.relatedTarget) {
        incrViolation("mouse_leave_window", "Mouse left viewport (possible alt-tab or other window)");
      }
    };

    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        incrViolation("fullscreen_exit", "User exited fullscreen");
      } else {
        sendViolationToServer("fullscreen_enter", "");
      }
    };

    let lastSize = { w: window.innerWidth, h: window.innerHeight };
    const onResize = () => {
      const w = window.innerWidth, h = window.innerHeight;
      const dw = Math.abs(w - lastSize.w), dh = Math.abs(h - lastSize.h);
      lastSize = { w, h };
      if (dw > RESIZE_THRESHOLD_PX || dh > RESIZE_THRESHOLD_PX) {
        const now = Date.now();
        resizeEvents.push(now);
        resizeEvents = resizeEvents.filter((ts) => now - ts <= FAST_RESIZE_WINDOW_MS);
        if (resizeEvents.length >= MAX_FAST_RESIZES) {
          incrViolation("fast_resizes", `multiple large resizes (${resizeEvents.length})`);
          resizeEvents = [];
        } else {
          sendViolationToServer("large_resize", `dw:${dw},dh:${dh}`);
        }
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
  // Developer tools
  if (e.key === "F12") incrViolation("devtools_key", "F12 pressed");
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "i")
    incrViolation("devtools_key", "Ctrl/Cmd+Shift+I pressed");

  // Tab switching
  if (e.key === "Tab" && e.ctrlKey)
    incrViolation("ctrl_tab", "Ctrl+Tab pressed (tab switch)");

  // Detect Ctrl/Cmd + V (Paste)
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
    incrViolation("paste_key", "Ctrl/Cmd+V pressed");
  }

  // ✅ NEW: Detect Ctrl/Cmd + C (Copy)
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
    incrViolation("copy_key", "Ctrl/Cmd+C pressed");
  }
};


    const onContextMenu = (e: MouseEvent) => { incrViolation("contextmenu", "Right-click/context menu opened"); };
    const onCopy = (e: ClipboardEvent) => { incrViolation("copy", "Copy attempted"); };
    const onPaste = (e: ClipboardEvent) => { incrViolation("paste", "Paste attempted"); };

    const onBeforeUnload = () => {
      try {
        const payload = JSON.stringify({ contestId, userId: user.uid, tabId, type: "unload" });
        if (navigator.sendBeacon) navigator.sendBeacon("/api/violation", payload);
        else {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/violation", false);
          xhr.setRequestHeader("Content-Type", "application/json");
          xhr.send(payload);
        }
      } catch (e) {}
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("mouseout", onMouseOut);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("copy", onCopy, true);
    document.addEventListener("paste", onPaste, true);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      if (closed) return;
      closed = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("mouseout", onMouseOut);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("copy", onCopy, true );
      document.removeEventListener("paste", onPaste, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contestId, user]);

  useEffect(() => {
    if (!contestId || !user) return;
    const ucDocRef = doc(db, `user_contests/${user.uid}_${contestId}`);
    const unsub = onSnapshot(ucDocRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as any;
      if (data?.status === "ended") {
        setIsContestOver(true);
        toast({ title: "Contest ended", description: "Your contest session was ended." });
        router.replace("/dashboard");
      }
    }, (err) => {
      console.error("user_contest onSnapshot error", err);
    });
    return () => unsub();
  }, [contestId, user, router, toast]);

  const handleRunCode = async () => {
    if (!activeQuestion || isContestOver) return;
    setIsSubmitting(true);
    setActiveTab("output");
    setOutput("Running...");
    try {
      const pistonLang = (language === "javascript" ? "javascript" : language === "python" ? "python3" : language) as string;
      const { inputsArr } = getSamplePairsFromQuestion(activeQuestion);
      const usedInput = inputsArr.length ? inputsArr[0] : (activeQuestion.sampleInput ?? "");
      const inputsMeta = Array.isArray((activeQuestion as any).inputs) ? (activeQuestion as any).inputs : [];
      const { code: wrapped, stdin } = buildWrapperForLanguage(language, code, usedInput || "", inputsMeta);
      const result = await runCode(pistonLang, wrapped, stdin ?? "");
      const text = extractOutputFromPiston(result);
      setOutput(text || "No output.");
    } catch (err: any) {
      setOutput("Error: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitCode = async () => {
    if (!activeQuestion || !user || isContestOver) return;
    setIsSubmitting(true);
    setActiveTab("tests");
    setOutput("Submitting...");
    try {
      const pistonLang = (language === "javascript" ? "javascript" : language === "python" ? "python3" : language) as string;
      const { inputsArr, outputsArr } = getSamplePairsFromQuestion(activeQuestion);
      const sampleInputs = inputsArr.length ? inputsArr : (activeQuestion.sampleInput ? [activeQuestion.sampleInput] : []);
      const sampleOutputs = outputsArr.length ? outputsArr : (activeQuestion.sampleOutput ? [activeQuestion.sampleOutput] : []);
      const inputsMeta = Array.isArray((activeQuestion as any).inputs) ? (activeQuestion as any).inputs : [];

      const results: TestResult[] = [];

      for (let i = 0; i < sampleInputs.length; i++) {
        const sin = sampleInputs[i] ?? "";
        const expected = String(sampleOutputs[i] ?? "");
        try {
          const { code: wrapped, stdin } = buildWrapperForLanguage(language, code, sin, inputsMeta);
          const res = await runCode(pistonLang, wrapped, stdin ?? "");
          const rawOut = extractOutputFromPiston(res);
          const actualTrim = rawOut.trim();
          const expectedTrim = expected.trim();
          const passed = actualTrim === expectedTrim;
          results.push({
            index: i,
            input: sin,
            expected,
            actual: actualTrim,
            passed,
            error: null,
          });
        } catch (runErr: any) {
          results.push({
            index: i,
            input: sin,
            expected,
            actual: null,
            passed: false,
            error: runErr?.message ?? String(runErr),
          });
        }
      }

      setTestResults(results);
      const allPassed = results.length > 0 && results.every((r) => r.passed);

      await addDoc(collection(db, "submissions"), {
        contestId,
        questionId: activeQuestion.id,
        userId: user.uid,
        code,
        language,
        status: allPassed ? "correct" : "incorrect",
        testSummary: {
          passedCount: results.filter((r) => r.passed).length,
          total: results.length,
        },
        submittedAt: serverTimestamp(),
      });

      if (allPassed) {
        toast({ title: "✅ Correct!", description: "All test cases passed!" });
        const newSolved = [...new Set([...solved, activeQuestion.id])];
        setSolved(newSolved);
        saveSolvedToLocal(contestId, user?.uid, newSolved);
        if (questions.length > 0 && newSolved.length === questions.length) {
          toast({ title: "Contest Completed!", description: "All questions submitted." });
          await lockContest();
          router.replace("/dashboard");
        }
      } else {
        toast({ variant: "destructive", title: "❌ Incorrect", description: "Some test cases failed. Check test results." });
      }

      const firstActual = results[0]?.actual ?? results[0]?.error ?? "No output";
      setOutput(`\n${firstActual}`);
    } catch (err: any) {
      setOutput("Error: " + err.message);
      toast({ variant: "destructive", title: "Execution Error", description: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading)
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );

  return (
    <div className="h-screen w-screen flex flex-col">
      <header className="flex h-16 items-center justify-between border-b px-4">
  <div className="flex items-center gap-3">
    <button
      onClick={() => {
        // navigate to /contest/[contestId] page
        if (typeof window !== "undefined") {
          router.push(`/contest/${contestId}`);
        }
      }}
      aria-label="Back to contest page"
      className="flex items-center gap-2 text-sm px-2 py-1 rounded hover:bg-muted transition"
      type="button"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
      <span>Back</span>
    </button>

    <h1 className="text-xl font-bold">{contest?.name}</h1>
  </div>

  {contest && (
    <ContestTimer
      duration={contest.duration}
      contestId={contestId}
      userId={user?.uid}
      onTimeUp={handleTimeUp}
    />
  )}
</header>


      <PanelGroup direction="horizontal" className="flex-grow">
        {/* Questions Panel */}
        <Panel defaultSize={25} minSize={20}>
          <div className="flex flex-col h-full">
            <h2 className="p-4 text-lg font-semibold border-b">Questions</h2>
            <ScrollArea className="flex-grow p-2">
              {groupedQuestions.map((group) => (
                <div key={group.level} className="mb-4">
                  <div className="px-2 py-1 bg-muted/50 rounded-t font-medium">Level {group.level}</div>
                  <div className="space-y-1">
                    {group.items.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">No questions for level {group.level}.</div>
                    ) : (
                      group.items.map((q) => (
                        <Button
                          key={q.id}
                          variant={activeQuestion?.id === q.id ? "secondary" : "ghost"}
                          className="w-full justify-between rounded-none p-3 h-auto text-left"
                          onClick={() => {
                            if (!isContestOver) {
                              setActiveQuestion(q);
                              const gen = generateDefaultCode(language, (q as any).inputs || []);
                              setCode(gen);
                              setOutput("");
                              setTestResults(null);
                            }
                          }}
                          disabled={isSubmitting || isContestOver}
                        >
                          <span className="truncate">{q.title}</span>
                          {solved.includes(q.id) && <CheckCircle className="h-5 w-5 text-green-500" />}
                        </Button>
                      ))
                    )}
                  </div>
                </div>
              ))}

              {otherQuestions.length > 0 && (
                <div className="mb-4">
                  <div className="px-2 py-1 bg-muted/50 rounded-t font-medium">Other Levels</div>
                  <div className="space-y-1">
                    {otherQuestions.map((q) => (
                      <Button
                        key={q.id}
                        variant={activeQuestion?.id === q.id ? "secondary" : "ghost"}
                        className="w-full justify-between rounded-none p-3 h-auto text-left"
                        onClick={() => {
                          if (!isContestOver) {
                            setActiveQuestion(q);
                            const gen = generateDefaultCode(language, (q as any).inputs || []);
                            setCode(gen);
                            setOutput("");
                            setTestResults(null);
                          }
                        }}
                        disabled={isSubmitting || isContestOver}
                      >
                        <span className="truncate">{q.title} <span className="text-xs text-muted-foreground">(level: {q.level})</span></span>
                        {solved.includes(q.id) && <CheckCircle className="h-5 w-5 text-green-500" />}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {questions.length === 0 && (
                <div className="px-3 py-2 text-sm text-muted-foreground">No questions available for this contest.</div>
              )}
            </ScrollArea>
          </div>
        </Panel>

        <PanelResizeHandle className="flex h-full w-2 cursor-col-resize bg-muted" />

        {/* Code Panel */}
        <Panel defaultSize={75} minSize={30}>
          {activeQuestion && (
            <PanelGroup direction="vertical" className="h-full">
              <Panel defaultSize={50}>
                <ScrollArea className="h-full p-4">
                  <h2 className="text-2xl font-bold mb-4">{activeQuestion.title}</h2>
                  <p className="text-muted-foreground whitespace-pre-wrap">{activeQuestion.description}</p>

                  <h3 className="font-semibold mt-6 mb-2">Sample Inputs</h3>
                  {Array.isArray((activeQuestion as any).sampleInputs) ? (
                    (activeQuestion as any).sampleInputs.map((si: string, idx: number) => (
                      <pre key={idx} className="bg-muted p-3 rounded text-sm font-mono mb-2">{si}</pre>
                    ))
                  ) : (
                    <pre className="bg-muted p-3 rounded text-sm font-mono">{activeQuestion.sampleInput}</pre>
                  )}

                  <h3 className="font-semibold mt-4 mb-2">Sample Outputs</h3>
                  {Array.isArray((activeQuestion as any).sampleOutputs) ? (
                    (activeQuestion as any).sampleOutputs.map((so: string, idx: number) => (
                      <pre key={idx} className="bg-muted p-3 rounded text-sm font-mono mb-2">{so}</pre>
                    ))
                  ) : (
                    <pre className="bg-muted p-3 rounded text-sm font-mono">{activeQuestion.sampleOutput}</pre>
                  )}

                  <h3 className="font-semibold mt-4 mb-2">Parameters (from admin)</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {(Array.isArray((activeQuestion as any).inputs) ? (activeQuestion as any).inputs : []).map((inp: any, i: number) => (
                      <div key={i} className="bg-muted p-2 rounded text-sm">
                        <div className="font-medium">{inp.name ?? `param${i+1}`}</div>
                        <div className="text-xs text-muted-foreground">{inp.type ?? "string"}</div>
                        <div className="text-xs font-mono mt-1">{inp.example ?? ""}</div>
                      </div>
                    ))}
                    {(!Array.isArray((activeQuestion as any).inputs) || (activeQuestion as any).inputs.length === 0) && (
                      <div className="text-sm text-muted-foreground">No parameter metadata provided by admin.</div>
                    )}
                  </div>
                </ScrollArea>
              </Panel>

              <PanelResizeHandle className="flex h-2 items-center justify-center bg-muted hover:bg-muted-foreground/20">
                <div className="h-1 w-10 rounded-full bg-border" />
              </PanelResizeHandle>

              <Panel defaultSize={50}>
                <div className="flex flex-col h-full">
                  <div className="p-2 border-b flex items-center justify-between">
                    <div className="flex items-center gap-3 font-semibold">
                      <Code className="h-5 w-5" /> Code Editor
                      <Select
                        value={language}
                        onValueChange={(val) => {
                          setLanguage(val);
                          const gen = generateDefaultCode(val, Array.isArray(activeQuestion?.inputs) ? activeQuestion!.inputs : []);
                          setCode(gen);
                        }}
                      >
                        <SelectTrigger className="w-[150px] h-8 text-xs">
                          <SelectValue placeholder="Language" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="javascript">JavaScript</SelectItem>
                          <SelectItem value="python">Python</SelectItem>
                          <SelectItem value="java">Java</SelectItem>
                          <SelectItem value="cpp">C++</SelectItem>
                          <SelectItem value="c">C</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleRunCode}
                        disabled={isSubmitting || isContestOver}
                      >
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Run"}
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSubmitCode}
                        disabled={isSubmitting || isContestOver}
                      >
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Submit"}
                      </Button>
                    </div>
                  </div>

                  <PanelGroup direction="vertical" className="flex-grow">
                    <Panel defaultSize={60}>
                      <div className="relative h-full">
                        <Editor
                          height="100%"
                          language={language}
                          value={code}
                          onChange={(v) => !isContestOver && setCode(v || "")}
                          theme="vs-dark"
                          options={{
                            fontSize: 14,
                            minimap: { enabled: false },
                            automaticLayout: true,
                            readOnly: isContestOver,
                          }}
                        />
                        {isContestOver && (
                          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60">
                            <div className="bg-white p-4 rounded shadow">
                              <p className="font-semibold">Contest Ended</p>
                              <p className="text-sm text-muted-foreground">You can no longer run or submit code for this contest.</p>
                              <div className="mt-3 flex justify-end">
                                <Button onClick={() => router.replace("/dashboard")}>Go to Dashboard</Button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </Panel>
                    <PanelResizeHandle className="flex h-2 items-center justify-center bg-muted hover:bg-muted-foreground/20">
                      <div className="h-1 w-10 rounded-full bg-border" />
                    </PanelResizeHandle>
                    <Panel defaultSize={40}>
                      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
                        <TabsList className="justify-start rounded-none border-b bg-card px-4">
                          <TabsTrigger value="output">Output</TabsTrigger>
                          <TabsTrigger value="tests">Test Results</TabsTrigger>
                        </TabsList>
                        <TabsContent value="output" className="flex-grow overflow-y-auto bg-black text-white p-4">
                          <pre className="font-mono whitespace-pre-wrap">{output}</pre>
                        </TabsContent>
                        <TabsContent value="tests" className="flex-grow p-4">
                          {!testResults ? (
                            <p className="text-muted-foreground">Test results will appear here after you click Submit.</p>
                          ) : (
                            <div className="space-y-3">
                              <div className="flex items-center gap-3">
                                <span className="font-semibold">Results</span>
                                <span className="text-sm text-muted-foreground">
                                  {testResults.filter(r => r.passed).length} / {testResults.length} passed
                                </span>
                              </div>

                              <div className="overflow-auto bg-card rounded">
                                <table className="min-w-full text-sm">
                                  <thead>
                                    <tr className="text-left">
                                      <th className="px-3 py-2">#</th>
                                      <th className="px-3 py-2">Input</th>
                                      <th className="px-3 py-2">Expected</th>
                                      <th className="px-3 py-2">Actual</th>
                                      <th className="px-3 py-2">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {testResults.map((t) => (
                                      <tr key={t.index} className="border-t">
                                        <td className="px-3 py-2 align-top">{t.index + 1}</td>
                                        <td className="px-3 py-2 align-top"><pre className="whitespace-pre-wrap font-mono">{t.input}</pre></td>
                                        <td className="px-3 py-2 align-top"><pre className="whitespace-pre-wrap font-mono">{t.expected}</pre></td>
                                        <td className="px-3 py-2 align-top">
                                          {t.error ? (
                                            <pre className="whitespace-pre-wrap font-mono text-red-500">{t.error}</pre>
                                          ) : (
                                            <pre className="whitespace-pre-wrap font-mono">{t.actual}</pre>
                                          )}
                                        </td>
                                        <td className="px-3 py-2 align-top">
                                          {t.passed ? (
                                            <div className="flex items-center gap-2 text-green-600">
                                              <CheckCircle className="h-5 w-5" /> Passed
                                            </div>
                                          ) : (
                                            <div className="flex items-center gap-2 text-red-600">
                                              <XCircle className="h-5 w-5" /> Failed
                                            </div>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </TabsContent>
                      </Tabs>
                    </Panel>
                  </PanelGroup>
                </div>
              </Panel>
            </PanelGroup>
          )}
        </Panel>
      </PanelGroup>
    </div>
  );
}

/* ---------------------------
   Timer component (same as your original)
   --------------------------- */
function ContestTimer({
  duration,
  contestId,
  userId,
  onTimeUp,
}: {
  duration: number;
  contestId?: string;
  userId?: string | null;
  onTimeUp: () => void;
}) {
  const timerKey = `contest_end:${contestId}:${userId ?? "anon"}`;

  const readPersistedEnd = (): number => {
    try {
      const raw = localStorage.getItem(timerKey);
      if (raw) {
        const v = Number(JSON.parse(raw));
        if (!Number.isNaN(v) && v > Date.now()) return v;
      }
    } catch {}
    return Date.now() + duration * 60 * 1000;
  };

  const [endTs, setEndTs] = useState<number>(() => readPersistedEnd());
  const [timeLeft, setTimeLeft] = useState<number>(() => Math.max(0, Math.round((readPersistedEnd() - Date.now()) / 1000)));
  const [openControls, setOpenControls] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(timerKey, JSON.stringify(endTs));
    } catch {}
    setTimeLeft(Math.max(0, Math.round((endTs - Date.now()) / 1000)));
  }, [endTs, timerKey]);

  useEffect(() => {
    const tick = () => {
      const left = Math.max(0, Math.round((endTs - Date.now()) / 1000));
      setTimeLeft(left);
      if (left <= 0) onTimeUp();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endTs, onTimeUp]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${h}:${m}:${s}`;
  };

  const addMinutesLocal = (mins: number) => {
    setEndTs((prev) => {
      const next = prev + mins * 60 * 1000;
      try { localStorage.setItem(timerKey, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const trySyncFromServer = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`/api/contest-end?contestId=${encodeURIComponent(contestId ?? "")}`);
      if (!res.ok) throw new Error("Server sync failed");
      const data = await res.json();
      if (data?.endTimestamp && Number(data.endTimestamp) > Date.now()) {
        setEndTs(Number(data.endTimestamp));
      } else {
        throw new Error("Invalid server endTimestamp");
      }
    } catch (err: any) {
      alert("Sync failed: " + (err?.message ?? "unknown"));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpenControls((s) => !s)}
        className={`flex items-center gap-2 font-mono text-lg font-semibold p-2 rounded-md ${
          timeLeft < 300 ? "text-destructive animate-pulse" : ""
        }`}
        title="Click to open timer controls"
      >
        <Clock className="h-5 w-5" />
        <span>{formatTime(timeLeft)}</span>
      </button>

      {openControls && (
        <div className="absolute right-0 mt-2 w-44 bg-card border rounded p-3 shadow">
          <div className="text-sm mb-2">Timer controls</div>
          <div className="flex gap-2">
            <button className="px-2 py-1 rounded bg-muted hover:bg-muted-foreground/20 text-sm" onClick={() => addMinutesLocal(5)}>
              +5 min
            </button>
            <button
              className="px-2 py-1 rounded bg-muted hover:bg-muted-foreground/20 text-sm"
              onClick={trySyncFromServer}
              disabled={syncing}
            >
              {syncing ? "Syncing..." : "Sync"}
            </button>
          </div>
          <div className="text-xs text-muted-foreground mt-2">Local changes only until server is updated.</div>
        </div>
      )}
    </div>
  );
}
