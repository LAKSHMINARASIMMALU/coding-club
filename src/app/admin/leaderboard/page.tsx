// app/admin/leaderboard/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Contest, LeaderboardEntry, User as AppUser } from "@/lib/types";

/**
 * Admin Leaderboard (Option C)
 * - Filters: contest (All or specific), department (All or specific)
 * - Ranks users by # of submissions (descending)
 * - Click a user -> show user's submissions (respecting contest filter if set)
 *
 * Notes:
 * - Avoids composite index by not using Firestore orderBy in queries; sorts client-side.
 * - Batch-fetches users when needed (in chunks of 10) to respect Firestore 'in' limit.
 * - Shows "Show all submissions (global)" and also can show per-contest submissions.
 */

type SubmissionDoc = {
  id: string;
  contestId?: string;
  questionId?: string;
  userId?: string;
  code?: string;
  language?: string;
  status?: string;
  testSummary?: { passedCount?: number; total?: number };
  submittedAt?: any;
  questionTitle?: string | null;
  questionPath?: string | null;
};

export default function AdminLeaderboardPage(): JSX.Element {
  const [contests, setContests] = useState<Contest[]>([]);
  const [selectedContest, setSelectedContest] = useState<string>("ALL"); // 'ALL' means all contests
  const [submissions, setSubmissions] = useState<SubmissionDoc[]>([]); // all fetched submissions (respecting contest filter if applied)
  const [allSubmissionsCount, setAllSubmissionsCount] = useState<number | null>(null); // total submissions across DB (fast stat)
  const [loadingSubmissions, setLoadingSubmissions] = useState<boolean>(false);
  const [loadingContests, setLoadingContests] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [selectedDepartment, setSelectedDepartment] = useState<string>("ALL");
  const [departments, setDepartments] = useState<string[]>([]);

  // Leaderboard derived state
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [usersMap, setUsersMap] = useState<Map<string, AppUser>>(new Map());

  // detail panel
  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const [detailSubmissions, setDetailSubmissions] = useState<SubmissionDoc[] | null>(null);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);

  // Fetch contests on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadingContests(true);
      try {
        const snap = await getDocs(collection(db, "contests"));
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Contest));
        if (!mounted) return;
        setContests(list);
      } catch (err) {
        console.error("fetch contests error", err);
        setErrorMessage("Failed to load contests (see console).");
      } finally {
        if (mounted) setLoadingContests(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Optionally fetch a quick total submissions count across all contests for dashboard (non-filtered)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "submissions"));
        if (!mounted) return;
        setAllSubmissionsCount(snap.size);
      } catch (err) {
        console.warn("count submissions failed", err);
        setAllSubmissionsCount(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Helper to fetch submissions depending on selectedContest value (ALL or specific)
  async function fetchSubmissionsForFilter(contestIdFilter: string | "ALL") {
    setLoadingSubmissions(true);
    setErrorMessage(null);
    try {
      if (contestIdFilter === "ALL") {
        // fetch all submissions in the collection
        const snap = await getDocs(collection(db, "submissions"));
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as SubmissionDoc));
        return list;
      } else {
        // fetch submissions only for the selected contest (no orderBy to avoid composite index)
        const q = query(collection(db, "submissions"), where("contestId", "==", contestIdFilter));
        const snap = await getDocs(q);
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as SubmissionDoc));
        return list;
      }
    } catch (err: any) {
      console.error("fetch submissions error", err);
      // show helpful guidance if index required
      if (String(err?.message ?? "").toLowerCase().includes("requires an index")) {
        setErrorMessage("Firestore requires a composite index for this query. Create it in Firebase Console → Indexes.");
      } else {
        setErrorMessage("Failed to load submissions (see console).");
      }
      return [];
    } finally {
      setLoadingSubmissions(false);
    }
  }

  // When filters change (contest selection), reload submissions and rebuild leaderboard + department list
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadingSubmissions(true);
      setDetailUserId(null);
      setDetailSubmissions(null);
      try {
        const list = await fetchSubmissionsForFilter(selectedContest as any);
        if (!mounted) return;

        // Sort submissions by submittedAt descending (client-side)
        list.sort((a, b) => {
          const getMs = (t: any) => {
            if (!t) return 0;
            if (typeof t === "object" && t.seconds) return t.seconds * 1000 + (t.nanoseconds ? Math.floor(t.nanoseconds / 1e6) : 0);
            const dt = new Date(t).getTime();
            return Number.isFinite(dt) ? dt : 0;
          };
          return getMs(b.submittedAt) - getMs(a.submittedAt);
        });

        setSubmissions(list);

        // Build department list from linked user docs (we'll batch fetch all involved user docs)
        const userIdsSet = new Set<string>();
        list.forEach((s) => {
          if (s.userId) userIdsSet.add(s.userId);
        });
        const userIds = Array.from(userIdsSet);

        // fetch user docs in batches of up to 10 (Firestore 'in' limit)
        const usersLocal = new Map<string, AppUser>();
        const BATCH = 10;
        for (let i = 0; i < userIds.length; i += BATCH) {
          const batch = userIds.slice(i, i + BATCH);
          if (batch.length === 0) continue;
          const uQ = query(collection(db, "users"), where("__name__", "in", batch));
          const uSnap = await getDocs(uQ);
          uSnap.forEach((u) => usersLocal.set(u.id, u.data() as AppUser));
        }
        // Extract unique departments
        const deptSet = new Set<string>();
        usersLocal.forEach((u) => {
          const d = (u as any)?.department ?? "Unknown";
          deptSet.add(String(d));
        });
        const deptList = Array.from(deptSet).sort();

        setUsersMap(usersLocal);
        setDepartments(["ALL", ...deptList]);

        // compute leaderboard (counts per user)
        const counts: Record<string, number> = {};
        list.forEach((s) => {
          const uid = s.userId ?? "__anon";
          counts[uid] = (counts[uid] || 0) + 1;
        });

        // filter by department if a department already chosen
        const filteredUserIds = userIds.filter((uid) => {
          if (selectedDepartment && selectedDepartment !== "ALL") {
            const u = usersLocal.get(uid);
            return ((u as any)?.department ?? "Unknown") === selectedDepartment;
          }
          return true;
        });

        const entries: LeaderboardEntry[] = filteredUserIds.map((uid) => {
          const u = usersLocal.get(uid);
          return {
            id: uid,
            userId: uid,
            userName: u?.name ?? (u?.email as string) ?? uid,
            contestId: selectedContest === "ALL" ? "ALL" : selectedContest,
            score: counts[uid] ?? 0, // using 'score' field to carry number of submissions
            // attach optional fields for display
            // @ts-ignore
            regNo: (u as any)?.regNo ?? "-",
            // @ts-ignore
            department: (u as any)?.department ?? "Unknown",
          } as LeaderboardEntry;
        });

        // sort by submission count desc and assign ranks (ties share same rank)
        entries.sort((a, b) => b.score - a.score || a.userName.localeCompare(b.userName));
        let lastScore: number | null = null;
        let lastRank = 0;
        const ranked = entries.map((e, idx) => {
          if (e.score !== lastScore) {
            lastRank = idx + 1;
            lastScore = e.score;
          }
          return { ...e, rank: lastRank };
        });

        setLeaderboard(ranked);
      } catch (err) {
        console.error("update filtered submissions error", err);
        setErrorMessage("Something went wrong while loading submissions.");
        setSubmissions([]);
        setLeaderboard([]);
        setDepartments(["ALL"]);
      } finally {
        if (mounted) setLoadingSubmissions(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [selectedContest, selectedDepartment]);

  // When selectedDepartment changes, recompute leaderboard from current submissions & user map
  useEffect(() => {
    // if usersMap or submissions changed, recompute ranking based on selectedDepartment
    const counts: Record<string, number> = {};
    submissions.forEach((s) => {
      const uid = s.userId ?? "__anon";
      counts[uid] = (counts[uid] || 0) + 1;
    });

    const userIds = Array.from(usersMap.keys());
    const filteredIds = userIds.filter((uid) => {
      if (selectedDepartment && selectedDepartment !== "ALL") {
        const u = usersMap.get(uid);
        return ((u as any)?.department ?? "Unknown") === selectedDepartment;
      }
      return true;
    });

    const entries: LeaderboardEntry[] = filteredIds.map((uid) => {
      const u = usersMap.get(uid);
      return {
        id: uid,
        userId: uid,
        userName: u?.name ?? (u?.email as string) ?? uid,
        contestId: selectedContest === "ALL" ? "ALL" : selectedContest,
        score: counts[uid] ?? 0,
        // @ts-ignore
        regNo: (u as any)?.regNo ?? "-",
        // @ts-ignore
        department: (u as any)?.department ?? "Unknown",
      } as LeaderboardEntry;
    });

    entries.sort((a, b) => b.score - a.score || a.userName.localeCompare(b.userName));
    let lastScore: number | null = null;
    let lastRank = 0;
    const ranked = entries.map((e, idx) => {
      if (e.score !== lastScore) {
        lastRank = idx + 1;
        lastScore = e.score;
      }
      return { ...e, rank: lastRank };
    });

    setLeaderboard(ranked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDepartment, usersMap, submissions]);

  // Load details (submissions) for chosen user (respecting contest filter if any)
  useEffect(() => {
    let mounted = true;
    if (!detailUserId) {
      setDetailSubmissions(null);
      return;
    }

    (async () => {
      setLoadingDetails(true);
      setErrorMessage(null);
      try {
        let list: SubmissionDoc[] = [];

        if (selectedContest === "ALL") {
          // fetch all submissions for this user across contests
          const q = query(collection(db, "submissions"), where("userId", "==", detailUserId));
          const snap = await getDocs(q);
          list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as SubmissionDoc));
        } else {
          // fetch submissions for selected contest and user
          const q = query(
            collection(db, "submissions"),
            where("contestId", "==", selectedContest),
            where("userId", "==", detailUserId)
          );
          const snap = await getDocs(q);
          list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as SubmissionDoc));
        }

        // fetch question titles for these submissions (to show friendly titles)
        const qIds = Array.from(new Set(list.map((s) => s.questionId).filter(Boolean) as string[]));
        const questionsMap = new Map<string, { title?: string }>();
        for (const qid of qIds) {
          try {
            const qDocRef = doc(db, "contests", selectedContest === "ALL" ? (list.find(s => s.questionId === qid)?.contestId ?? "") : selectedContest, "questions", qid);
            // Notice: When contest is ALL and question belongs to different contests, we try contestId from submission
            // if not available, we skip title fetch.
            const contestRefId = selectedContest === "ALL" ? (list.find(s => s.questionId === qid)?.contestId ?? null) : selectedContest;
            if (!contestRefId) {
              questionsMap.set(qid, { title: "(unknown contest)" });
              continue;
            }
            const qDocRef2 = doc(db, "contests", contestRefId, "questions", qid);
            const qSnap = await getDoc(qDocRef2);
            if (qSnap.exists()) questionsMap.set(qid, qSnap.data() as any);
            else questionsMap.set(qid, { title: "(deleted)" });
          } catch (qe) {
            console.error("question fetch error", qe);
            questionsMap.set(qid, { title: "(error)" });
          }
        }

        // attach and sort by date desc
        const enhanced = list.map((s) => {
          const meta = s.questionId ? questionsMap.get(s.questionId) : undefined;
          const questionTitle = meta?.title ?? (s.questionId ? `Question ${s.questionId}` : null);
          const qp = s.questionId && s.contestId ? `/contest/${s.contestId}/questions/${s.questionId}` : null;
          return { ...s, questionTitle, questionPath: qp } as SubmissionDoc;
        });

        enhanced.sort((a, b) => {
          const getMs = (t: any) => {
            if (!t) return 0;
            if (typeof t === "object" && t.seconds) return t.seconds * 1000 + (t.nanoseconds ? Math.floor(t.nanoseconds / 1e6) : 0);
            const dt = new Date(t).getTime();
            return Number.isFinite(dt) ? dt : 0;
          };
          return getMs(b.submittedAt) - getMs(a.submittedAt);
        });

        if (!mounted) return;
        setDetailSubmissions(enhanced);
      } catch (err: any) {
        console.error("load user details error", err);
        setDetailSubmissions([]);
        setErrorMessage("Failed to load user submissions (see console).");
      } finally {
        if (mounted) setLoadingDetails(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [detailUserId, selectedContest]);

  // Derived values for UI
  const topStats = useMemo(() => {
    return {
      totalFetched: submissions.length,
      totalDB: allSubmissionsCount,
      usersCount: usersMap.size,
    };
  }, [submissions.length, allSubmissionsCount, usersMap.size]);

  return (
    <div style={{ padding: 18 }}>
      <h1 style={{ margin: 0 }}>Admin — Leaderboard (by # submissions)</h1>
      <p style={{ color: "#666", marginTop: 6 }}>Filter by contest and department. Rank = number of submissions (desc).</p>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12 }}>
        <label>
          Contest:
          <select
            value={selectedContest}
            onChange={(e) => {
              setSelectedContest(e.target.value);
              setDetailUserId(null);
              setDetailSubmissions(null);
            }}
            style={{ marginLeft: 8, padding: 6 }}
          >
            <option value="ALL">All contests</option>
            {contests.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name ?? c.id}
              </option>
            ))}
          </select>
        </label>

        <label>
          Department:
          <select
            value={selectedDepartment}
            onChange={(e) => {
              setSelectedDepartment(e.target.value);
              setDetailUserId(null);
              setDetailSubmissions(null);
            }}
            style={{ marginLeft: 8, padding: 6 }}
          >
            <option value="ALL">All departments</option>
            {departments
              .filter((d) => d !== "ALL")
              .map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
          </select>
        </label>

        <div style={{ marginLeft: "auto", color: "#333", fontSize: 14 }}>
          <strong>Fetched:</strong> {topStats.totalFetched} submissions •{" "}
          <strong>Users:</strong> {topStats.usersCount} •{" "}
          <strong>Total DB:</strong> {topStats.totalDB ?? "—"}
        </div>
      </div>

      {errorMessage && (
        <div style={{ marginTop: 12, padding: 10, background: "#fee", color: "#600", borderRadius: 6 }}>
          {errorMessage}
        </div>
      )}

      <div style={{ display: "flex", gap: 20, marginTop: 18 }}>
        {/* Leaderboard table */}
        <div style={{ flex: 1 }}>
          <div style={{ border: "1px solid #e6e6e6", borderRadius: 8, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ background: "#fafafa" }}>
                <tr>
                  <th style={{ textAlign: "left", padding: 12 }}>Rank</th>
                  <th style={{ textAlign: "left", padding: 12 }}>Name</th>
                  <th style={{ textAlign: "left", padding: 12 }}>Reg No</th>
                  <th style={{ textAlign: "left", padding: 12 }}>Department</th>
                  <th style={{ textAlign: "right", padding: 12 }}>Submissions</th>
                </tr>
              </thead>
              <tbody>
                {loadingSubmissions ? (
                  <tr><td colSpan={5} style={{ padding: 20, textAlign: "center" }}>Loading submissions…</td></tr>
                ) : leaderboard.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: 20, textAlign: "center" }}>No data (no submissions) for selected filters.</td></tr>
                ) : (
                  leaderboard.map((row) => (
                    <tr
                      key={row.userId}
                      onClick={() => setDetailUserId(row.userId)}
                      style={{ cursor: "pointer", borderTop: "1px solid #f3f3f3" }}
                      title="Click to view this user's submissions"
                    >
                      <td style={{ padding: 12, width: 80 }}>{row.rank}</td>
                      <td style={{ padding: 12 }}>{row.userName}</td>
                      <td style={{ padding: 12 }}>{(row as any).regNo ?? "-"}</td>
                      <td style={{ padding: 12 }}>{(row as any).department ?? "Unknown"}</td>
                      <td style={{ padding: 12, textAlign: "right", fontWeight: 700 }}>{row.score}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Details panel */}
        <div style={{ width: 640 }}>
          <div style={{ border: "1px solid #e6e6e6", borderRadius: 8, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontWeight: 700 }}>
                {detailUserId ? `Submissions for ${detailUserId}` : "Submissions"}
              </div>
              <div>
                <button
                  onClick={() => { setDetailUserId(null); setDetailSubmissions(null); }}
                  style={{ padding: "6px 8px" }}
                >
                  Close
                </button>
              </div>
            </div>

            {!detailUserId ? (
              <div style={{ color: "#666" }}>Click a user on the left to inspect all their submissions (filtered by the contest selection).</div>
            ) : loadingDetails ? (
              <div>Loading user's submissions…</div>
            ) : !detailSubmissions || detailSubmissions.length === 0 ? (
              <div>No submissions found for this user under the current filter.</div>
            ) : (
              <div style={{ maxHeight: 680, overflow: "auto" }}>
                <div style={{ marginBottom: 8, color: "#444", fontSize: 13 }}>
                  Showing {detailSubmissions.length} submissions ({selectedContest === "ALL" ? "across contests" : `for contest ${selectedContest}`})
                </div>

                {detailSubmissions.map((s) => (
                  <div key={s.id} style={{ borderTop: "1px solid #f3f3f3", padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{s.questionTitle ?? (s.questionId ?? "(no question)")}</div>
                        <div style={{ color: "#666", fontSize: 13 }}>
                          {s.language ?? "unknown"} • status: <strong>{s.status ?? "-"}</strong>
                          {s.contestId ? <> • contest: {s.contestId}</> : null}
                        </div>
                      </div>

                      <div style={{ minWidth: 160, textAlign: "right", fontSize: 13, color: "#666" }}>
                        <div>
                          {s.submittedAt ? new Date((s.submittedAt.seconds ? s.submittedAt.seconds * 1000 : s.submittedAt)).toLocaleString() : ""}
                        </div>
                        {s.questionPath ? (
                          <div style={{ marginTop: 8 }}>
                            <a href={s.questionPath} target="_blank" rel="noreferrer" style={{ color: "#2563eb" }}>Open question</a>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <details style={{ marginTop: 8 }}>
                      <summary style={{ cursor: "pointer", color: "#2563eb" }}>View code / test summary</summary>
                      <pre style={{ background: "#111827", color: "#fff", padding: 12, marginTop: 8, whiteSpace: "pre-wrap", borderRadius: 6 }}>
                        {String(s.code ?? "(no code)")}
                      </pre>
                      {s.testSummary && (
                        <div style={{ marginTop: 8 }}>
                          <strong>Test summary:</strong> {s.testSummary.passedCount ?? 0} / {s.testSummary.total ?? 0}
                        </div>
                      )}
                    </details>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
