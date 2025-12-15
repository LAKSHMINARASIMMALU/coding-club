// app/api/admin/impersonate/route.ts
import { NextResponse } from "next/server";
import admin from "firebase-admin";

type Body = {
  targetUserId: string;
  contestId: string;
  questionId: string;
  language: string; // e.g. "python3", "javascript"
  code: string;
  quick?: boolean;
  stdin?: string; // optional, used only if you want
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}
const db = admin.firestore();
const PISTON_URL = process.env.PISTON_URL || "https://emkc.org/api/v2/piston/execute";

export async function POST(req: Request) {
  try {
    // verify caller token
    const authHeader = req.headers.get("authorization") || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) {
      return NextResponse.json({ error: "Missing Authorization token" }, { status: 401 });
    }

    let caller: admin.auth.DecodedIdToken;
    try {
      caller = await admin.auth().verifyIdToken(idToken);
    } catch (err) {
      console.error("verifyIdToken failed", err);
      return NextResponse.json({ error: "Invalid auth token" }, { status: 401 });
    }

    // require admin custom claim
    const callerUser = await admin.auth().getUser(caller.uid);
    const claims = callerUser.customClaims || {};
    if (!claims.admin && !claims.role === "admin") {
      return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
    }

    const body = (await req.json()) as Body | null;
    if (!body) return NextResponse.json({ error: "Missing body" }, { status: 400 });

    const { targetUserId, contestId, questionId, language, code, quick } = body;
    if (!targetUserId || !contestId || !questionId || !language || !code) {
      return NextResponse.json({ error: "targetUserId, contestId, questionId, language, code are required" }, { status: 400 });
    }

    // load hidden testcases
    const tcsSnap = await db
      .collection("contests")
      .doc(contestId)
      .collection("questions")
      .doc(questionId)
      .collection("testcases")
      .orderBy("order", "asc")
      .get();

    if (tcsSnap.empty) {
      return NextResponse.json({ error: "No testcases for this question" }, { status: 400 });
    }

    const tcs = tcsSnap.docs.map((d) => d.data() as any);
    const runTests = quick ? tcs.slice(0, 1) : tcs;

    type Result = { stdout: string | null; stderr: string | null; passed: boolean; error?: string | null };
    const results: Result[] = [];

    for (const tc of runTests) {
      try {
        const payload = {
          language,
          version: tc.runnerVersion || "*",
          files: [{ name: "Main", content: code }],
          // admin may pass a custom stdin in body.stdin, but hidden tests normally use tc.input
          stdin: String(tc.input ?? (body.stdin ?? "")),
        };

        const runnerRes = await fetch(PISTON_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!runnerRes.ok) {
          const txt = await runnerRes.text();
          console.error("Runner non-OK:", runnerRes.status, txt);
          results.push({ stdout: null, stderr: null, passed: false, error: `Runner error ${runnerRes.status}` });
          continue;
        }

        const runBody = await runnerRes.json();
        const run = runBody.run ?? runBody;
        const stdoutRaw = run?.stdout ?? run?.output ?? runBody.stdout ?? "";
        const stderrRaw = run?.stderr ?? runBody.stderr ?? null;

        const actualTrim = String(stdoutRaw ?? "").trim();
        const expectedTrim = String(tc.expectedOutput ?? "").trim();

        // strict equality, adjust if you want tolerant comparison
        const passed = expectedTrim !== "" ? actualTrim === expectedTrim : false;

        results.push({ stdout: actualTrim || "", stderr: stderrRaw ?? null, passed, error: null });
      } catch (err: any) {
        console.error("Runner call failed:", err);
        results.push({ stdout: null, stderr: null, passed: false, error: String(err?.message ?? err) });
      }
    }

    const passedCount = results.filter((r) => r.passed).length;
    const total = results.length;
    const finalStatus = passedCount === total ? "correct" : "incorrect";

    // write submission on behalf of targetUserId
    const submissionRef = db.collection("submissions").doc();
    await submissionRef.set({
      contestId,
      questionId,
      userId: targetUserId,
      code,
      language,
      status: finalStatus,
      testSummary: { passedCount, total },
      results: results.map((r) => ({ stdout: r.stdout, stderr: r.stderr, passed: r.passed, error: r.error })),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdByAdmin: caller.uid, // audit: who performed impersonation
    });

    const responsePayload = {
      submissionId: submissionRef.id,
      testSummary: { passedCount, total },
      status: finalStatus,
      outputs: results.map((r, i) => ({ index: i, stdout: r.stdout, stderr: r.stderr, passed: r.passed, error: r.error })),
    };

    return NextResponse.json(responsePayload, { status: 200 });
  } catch (err: any) {
    console.error("impersonate error:", err);
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}
