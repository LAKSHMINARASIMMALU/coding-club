// app/(contest)/live/[contestId]/page.tsx
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  orderBy,
  addDoc,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import type { Contest, Question } from "@/lib/types";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Clock, Play, Code, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
// FIXED import path -> use alias "@/components/..."
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/* ----------------- persist helpers for solved/locked questions ----------------- */
const solvedStorageKey = (contestId: string, userId?: string) => `contest_solved:${contestId}:${userId ?? "anon"}`;
function loadSolvedFromLocal(contestId: string, userId?: string) {
  try {
    const raw = localStorage.getItem(solvedStorageKey(contestId, userId));
    if (!raw) return [] as string[];
    return JSON.parse(raw) as string[];
  } catch {
    return [] as string[];
  }
}
function saveSolvedToLocal(contestId: string, userId: string | undefined, arr: string[]) {
  try {
    localStorage.setItem(solvedStorageKey(contestId, userId), JSON.stringify(arr));
  } catch {}
}

/* ----------------- timer persistence helpers ----------------- */
const timerStorageKey = (contestId: string, userId?: string) => `contest_timer:${contestId}:${userId ?? "anon"}`;

function readPersistedEndTs(contestId: string, userId?: string): number | null {
  try {
    const raw = localStorage.getItem(timerStorageKey(contestId, userId));
    if (!raw) return null;
    const val = Number(JSON.parse(raw));
    if (!Number.isFinite(val)) return null;
    return val;
  } catch {
    return null;
  }
}

function persistEndTs(contestId: string, userId: string | undefined, endTs: number) {
  try {
    localStorage.setItem(timerStorageKey(contestId, userId), JSON.stringify(endTs));
  } catch {}
}

function clearPersistedEndTs(contestId: string, userId?: string) {
  try {
    localStorage.removeItem(timerStorageKey(contestId, userId));
  } catch {}
}

/* ----------------- ContestTimer (reads/writes persistent end timestamp) ----------------- */
function ContestTimer({
  duration,
  contestId,
  userId,
  onTimeUp,
}: {
  duration: number;
  contestId: string;
  userId?: string | null;
  onTimeUp: () => void;
}) {
  const [endTs, setEndTs] = useState<number | null>(() => {
    try {
      const persisted = readPersistedEndTs(contestId, userId ?? undefined);
      if (persisted && persisted > Date.now()) return persisted;
    } catch {}
    return null;
  });

  useEffect(() => {
    if (endTs) return;
    const computed = Date.now() + Math.max(0, Math.floor(duration * 60)) * 1000;
    setEndTs(computed);
    persistEndTs(contestId, userId ?? undefined, computed);
  }, [duration, endTs, contestId, userId]);

  const [secondsLeft, setSecondsLeft] = useState<number>(() => {
    if (!endTs) return Math.max(0, Math.floor(duration * 60));
    return Math.max(0, Math.round((endTs - Date.now()) / 1000));
  });

  useEffect(() => {
    if (!endTs) return;
    const tick = () => {
      const left = Math.max(0, Math.round((endTs - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) {
        clearPersistedEndTs(contestId, userId ?? undefined);
        try {
          onTimeUp();
        } catch {}
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endTs, contestId, userId, onTimeUp]);

  const addMinutesLocal = (mins: number) => {
    if (!endTs) return;
    const next = endTs + mins * 60 * 1000;
    setEndTs(next);
    persistEndTs(contestId, userId ?? undefined, next);
    setSecondsLeft(Math.max(0, Math.round((next - Date.now()) / 1000)));
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${h}:${m}:${s}`;
  };

  return (
    <div className="relative">
      <div className={`flex items-center gap-2 font-mono text-lg font-semibold p-2 rounded-md ${secondsLeft < 300 ? "text-destructive animate-pulse" : ""}`}>
        <Clock className="h-5 w-5" />
        <span>{formatTime(secondsLeft)}</span>
      </div>
      <div style={{ display: "none" }}>
        <button onClick={() => addMinutesLocal(5)}>+5</button>
      </div>
    </div>
  );
}

/* ----------------- Page component ----------------- */
export default function LiveContestPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const contestId = params.contestId as string;
  const workerRef = useRef<Worker | null>(null);

  const [contest, setContest] = useState<Contest | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [activeQuestion, setActiveQuestion] = useState<Question | null>(null);
  const [code, setCode] = useState<string>("");
  const [language, setLanguage] = useState<string>("javascript");
  const [userInput, setUserInput] = useState<string>("");
  const [output, setOutput] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [solvedQuestions, setSolvedQuestions] = useState<string[]>([]);

  const activeQuestionRef = useRef<Question | null>(null);
  const codeRef = useRef<string>("");
  const languageRef = useRef<string>("javascript");
  useEffect(() => { activeQuestionRef.current = activeQuestion; }, [activeQuestion]);
  useEffect(() => { codeRef.current = code; }, [code]);
  useEffect(() => { languageRef.current = language; }, [language]);

  const mapToRunnerLanguage = (lang: string) => {
    if (lang === "javascript") return "javascript";
    if (lang === "python") return "python3";
    if (lang === "java") return "java";
    if (lang === "cpp") return "cpp";
    if (lang === "c") return "c";
    return lang;
  };

  useEffect(() => {
    if (!contestId) return;
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const cRef = doc(db, "contests", contestId);
        const cSnap = await getDoc(cRef);
        if (!cSnap.exists()) {
          router.replace("/dashboard");
          return;
        }
        setContest({ id: cSnap.id, ...(cSnap.data() as any) } as Contest);

        const q = query(collection(db, `contests/${contestId}/questions`), orderBy("level"));
        const qSnap = await getDocs(q);
        const qList = qSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Question));
        setQuestions(qList);

        if (qList.length > 0) {
          setActiveQuestion(qList[0]);
          setUserInput(String(qList[0].sampleInput ?? ""));
          setCode(String((qList[0] as any).starterCode ?? ""));
        }
      } catch (err) {
        console.error("fetch contest error", err);
        toast({ variant: "destructive", title: "Error", description: "Failed to load contest." });
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [contestId, router, toast]);

  useEffect(() => {
    if (!contestId) return;
    const initSolved = async () => {
      const local = loadSolvedFromLocal(contestId, user?.uid);
      let merged = Array.from(new Set(local || []));
      if (user?.uid) {
        try {
          const sQuery = query(
            collection(db, "submissions"),
            where("contestId", "==", contestId),
            where("userId", "==", user.uid)
          );
          const snap = await getDocs(sQuery);
          const qIds = snap.docs.map((d) => (d.data() as any)?.questionId).filter(Boolean) as string[];
          if (qIds.length > 0) merged = Array.from(new Set([...merged, ...qIds]));
        } catch (err) {
          console.warn("Failed to load user submissions:", err);
        }
      }
      setSolvedQuestions(merged);
      saveSolvedToLocal(contestId, user?.uid, merged);
    };
    initSolved();
  }, [contestId, user?.uid]);

  useEffect(() => {
    const workerCode = `
      self.onmessage = function (e) {
        const { code, input, expectedOutput, forSubmission } = e.data;
        let captured = '';
        const origLog = console.log;
        console.log = (...args) => { captured += args.map(String).join(' ') + '\\n'; };
        try {
          const fn = new Function('input', code);
          const res = fn(input);
          if (res !== undefined && res !== null) captured += String(res) + '\\n';
          const final = captured.trim();
          const expectedTrim = typeof expectedOutput === 'string' ? expectedOutput.trim() : '';
          const passed = expectedTrim !== '' ? final === expectedTrim : false;
          self.postMessage({ output: final || 'No output.', isCorrect: passed, forSubmission });
        } catch (err) {
          const msg = err && err.message ? err.message : String(err);
          self.postMessage({ error: msg, forSubmission });
        } finally {
          console.log = origLog;
        }
      };
    `;
    const blob = new Blob([workerCode], { type: "application/javascript" });
    workerRef.current = new Worker(URL.createObjectURL(blob));

    workerRef.current.onmessage = async (ev: MessageEvent) => {
      const data = ev.data as { output?: string; error?: string; isCorrect?: boolean; forSubmission: boolean };
      const { output: wOut, error, isCorrect, forSubmission } = data;

      if (forSubmission) {
        const aq = activeQuestionRef.current;
        const codeNow = codeRef.current;
        const langNow = languageRef.current;
        if (!aq || !user?.uid) {
          setOutput("Submission failed: missing question or user.");
          setIsSubmitting(false);
          return;
        }
        try {
          const status = error ? "error" : isCorrect ? "correct" : "incorrect";
          const testSummary = { passedCount: isCorrect ? 1 : 0, total: 1 };

          await addDoc(collection(db, "submissions"), {
            contestId,
            questionId: aq.id,
            userId: user.uid,
            code: codeNow,
            language: langNow,
            status,
            testSummary,
            output: wOut ?? "",
            error: error ?? null,
            submittedAt: serverTimestamp(),
          });

          setOutput(error ? `Error: ${error}` : (wOut ?? "No output."));

          setSolvedQuestions((prev) => {
            const merged = Array.from(new Set([...prev, aq.id]));
            saveSolvedToLocal(contestId, user?.uid, merged);
            return merged;
          });

          if (isCorrect) {
            toast({ title: "Correct Answer!", description: "Saved & locked." });
          } else {
            toast({ variant: "destructive", title: "Submitted", description: "Saved & locked (incorrect)." });
          }
        } catch (err: any) {
          console.error("Saving JS submission failed:", err);
          setOutput("Submission save failed: " + (err?.message ?? String(err)));
          toast({ variant: "destructive", title: "Save failed", description: String(err?.message ?? err) });
        } finally {
          setIsSubmitting(false);
        }
      } else {
        if (error) setOutput(`Error: ${error}`);
        else setOutput(wOut ?? "");
        setIsSubmitting(false);
      }
    };

    return () => {
      try { workerRef.current?.terminate(); } catch {}
    };
  }, [contestId, user, toast]);

  async function callExecuteApi(languageParam: string, codeParam: string, stdinParam: string) {
    const res = await fetch("/api/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: languageParam, code: codeParam, stdin: stdinParam }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? JSON.stringify(data));
    return data;
  }

  const handleRunCode = async () => {
    if (!activeQuestion) return;
    if (solvedQuestions.includes(activeQuestion.id)) {
      toast?.({ title: "Already submitted", description: "You already submitted this question and cannot run it again." });
      return;
    }
    setIsSubmitting(true);
    setOutput("Executing...");
    const stdin = userInput ?? "";

    if (language === "javascript") {
      workerRef.current?.postMessage({ code, input: stdin, expectedOutput: activeQuestion.sampleOutput ?? "", forSubmission: false });
      return;
    }

    try {
      const runnerLang = mapToRunnerLanguage(language);
      const execResp = await callExecuteApi(runnerLang, code, stdin);
      const run = execResp.run ?? execResp;
      const stdout = run?.stdout ?? run?.output ?? execResp.stdout ?? "";
      const stderr = run?.stderr ?? execResp.stderr ?? null;
      const text = String(stdout ?? "").trim();
      const stderrText = stderr ? `\n\n[stderr]\n${stderr}` : "";
      setOutput((text || "No output.") + stderrText);
    } catch (err: any) {
      setOutput("Execution failed: " + (err?.message ?? String(err)));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitCode = async () => {
    if (!activeQuestion) {
      setOutput("No question selected.");
      return;
    }
    if (!user?.uid) {
      setOutput("You must be signed in to submit.");
      toast?.({ variant: "destructive", title: "Sign in required", description: "Please sign in to submit." });
      return;
    }
    if (solvedQuestions.includes(activeQuestion.id)) {
      setOutput("You already submitted this question.");
      toast?.({ title: "Already submitted", description: "This question is locked." });
      return;
    }

    setIsSubmitting(true);
    setOutput("Submitting...");
    const stdin = userInput ?? "";

    if (language === "javascript") {
      workerRef.current?.postMessage({ code, input: stdin, expectedOutput: activeQuestion.sampleOutput ?? "", forSubmission: true });
      return;
    }

    try {
      await addDoc(collection(db, "submissions"), {
        contestId,
        questionId: activeQuestion.id,
        userId: user.uid,
        code,
        language,
        status: "submitted",
        stdin: stdin ?? "",
        submittedAt: serverTimestamp(),
      });

      setSolvedQuestions((prev) => {
        const merged = Array.from(new Set([...prev, activeQuestion.id]));
        saveSolvedToLocal(contestId, user?.uid, merged);
        return merged;
      });

      toast({ title: "Submitted!", description: "Your submission was saved and question locked." });
      setOutput("Submission saved!");
    } catch (err: any) {
      console.error("Submission error:", err);
      toast({ variant: "destructive", title: "Error submitting", description: err?.message ?? String(err) });
      setOutput("Submission error: " + (err?.message ?? String(err)));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col">
      <header className="flex h-16 items-center justify-between border-b px-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              try { router.back(); } catch { router.push("/dashboard"); }
            }}
            className="text-sm px-2 py-1 rounded hover:bg-muted transition flex items-center gap-2"
            type="button"
            aria-label="Back"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <h1 className="text-xl font-bold">{contest?.name}</h1>
        </div>

        {contest && <ContestTimer duration={contest.duration} contestId={contestId} userId={user?.uid ?? undefined} onTimeUp={() => { toast({ title: "Time's up" }); router.replace("/dashboard"); }} />}
      </header>

      <ResizablePanelGroup direction="horizontal" className="flex-grow">
        <ResizablePanel defaultSize={25} minSize={20}>
          <div className="flex flex-col h-full">
            <h2 className="p-4 text-lg font-semibold border-b">Questions</h2>
            <ScrollArea className="flex-grow">
              {questions.map((q) => {
                const isSolved = solvedQuestions.includes(q.id);
                return (
                  <Button
                    key={q.id}
                    variant={activeQuestion?.id === q.id ? (isSolved ? "secondary" : "secondary") : (isSolved ? "ghost" : "ghost")}
                    className={`w-full justify-start rounded-none p-4 h-auto flex items-center gap-3 ${isSolved ? "opacity-70 cursor-not-allowed" : ""}`}
                    onClick={() => {
                      if (isSolved) {
                        toast?.({ title: "Submitted", description: "You already submitted this question and cannot open it again." });
                        return;
                      }
                      setActiveQuestion(q);
                      setCode(String((q as any).starterCode ?? ""));
                      setOutput("");
                      setUserInput(String(q.sampleInput ?? ""));
                    }}
                    disabled={isSubmitting}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="truncate">
                        <span className="font-medium">{q.title}</span>
                        {isSolved && <span className="ml-2 text-xs text-muted-foreground">submitted</span>}
                      </div>
                      {isSolved && <CheckCircle className="h-5 w-5 text-green-500" />}
                    </div>
                  </Button>
                );
              })}
            </ScrollArea>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={75} minSize={30}>
          {activeQuestion && (
            <ResizablePanelGroup direction="vertical">
              <ResizablePanel defaultSize={50} minSize={20}>
                <ScrollArea className="h-full p-4">
                  <h2 className="text-2xl font-bold mb-4">{activeQuestion.title}</h2>

                  <h3 className="font-semibold mt-4 mb-2">Description</h3>
                  <p className="text-muted-foreground whitespace-pre-wrap">{activeQuestion.description}</p>

                  <h3 className="font-semibold mt-6 mb-2">Constraints</h3>
                  <pre className="bg-muted p-2 rounded text-sm font-mono">{String(activeQuestion.constraints ?? "")}</pre>

                  <div className="grid md:grid-cols-2 gap-4 mt-6">
                    <div>
                      <h3 className="font-semibold mb-2">Sample Input</h3>
                      <pre className="bg-muted p-3 rounded text-sm font-mono">{String(activeQuestion.sampleInput ?? "")}</pre>
                    </div>
                    <div>
                      <h3 className="font-semibold mb-2">Sample Output</h3>
                      <pre className="bg-muted p-3 rounded text-sm font-mono">{String(activeQuestion.sampleOutput ?? "")}</pre>
                    </div>
                  </div>
                </ScrollArea>
              </ResizablePanel>

              <ResizableHandle withHandle />

              <ResizablePanel defaultSize={50} minSize={20}>
                <div className="flex flex-col h-full">
                  <div className="p-2 border-b flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 font-semibold"><Code className="h-5 w-5" /> Code Editor</div>

                      <Select value={language} onValueChange={setLanguage} disabled={isSubmitting || solvedQuestions.includes(activeQuestion.id)}>
                        <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue placeholder="Language" /></SelectTrigger>
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
                      <Button size="sm" variant="outline" onClick={handleRunCode} disabled={isSubmitting || solvedQuestions.includes(activeQuestion.id)}>
                        {isSubmitting && language === "javascript" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />} Run
                      </Button>
                      <Button size="sm" onClick={handleSubmitCode} disabled={isSubmitting || solvedQuestions.includes(activeQuestion.id)}>
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {solvedQuestions.includes(activeQuestion.id) ? "Submitted" : "Submit"}
                      </Button>
                    </div>
                  </div>

                  <Textarea
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="// write your code here"
                    className="flex-grow w-full h-full rounded-none border-0 font-mono text-base focus-visible:ring-0"
                    disabled={isSubmitting || solvedQuestions.includes(activeQuestion.id)}
                  />

                  <div className="p-2 border-t bg-card">
                    <h3 className="font-semibold text-sm mb-2">Custom Input (stdin)</h3>
                    <Textarea
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      placeholder="stdin for your program (defaults to sample input)"
                      className="w-full font-mono text-sm mb-2"
                      disabled={isSubmitting || solvedQuestions.includes(activeQuestion.id)}
                      rows={4}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setUserInput(String(activeQuestion.sampleInput ?? ""))} disabled={isSubmitting}>Reset to Sample Input</Button>
                      <Button size="sm" variant="ghost" onClick={() => setUserInput("")} disabled={isSubmitting}>Clear Input</Button>
                    </div>
                  </div>

                  <div className="p-2 border-t h-[160px] flex flex-col bg-muted/50">
                    <h3 className="font-semibold text-sm mb-1">Output</h3>
                    <ScrollArea className="flex-grow"><pre className="text-sm font-mono whitespace-pre-wrap">{output}</pre></ScrollArea>
                  </div>
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
