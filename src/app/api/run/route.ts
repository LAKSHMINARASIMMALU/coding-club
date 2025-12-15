// app/api/run/route.ts
import { NextResponse } from "next/server";
import admin from "firebase-admin";

type RunRequest = {
  contestId: string;
  questionId: string;
  language: string; // e.g. "python3", "javascript"
  code: string;
  quick?: boolean;
  stdin?: string;
};

if (!admin.apps.length) {
  // Initialize admin with application default credentials.
  // In production set GOOGLE_APPLICATION_CREDENTIALS or use your hosting provider's built-in credentials.
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
    console.log("[api/run] Firebase admin initialized (applicationDefault).");
  } catch (initErr) {
    console.error("[api/run] admin.initializeApp failed:", initErr);
  }
}

const db = admin.firestore();
const PISTON_URL = process.env.PISTON_URL || "https://emkc.org/api/v2/piston/execute";

// utility: truncate long strings
function truncate(s: string | null | undefined, n = 10000) {
  if (!s) return s ?? "";
  const str = String(s);
  return str.length > n ? str.slice(0, n) + "\n...[truncated]" : str;
}

export async function POST(req: Request) {
  try {
    // read and log headers for debugging
    const authHeader = req.headers.get("authorization") || "";
    console.log("[api/run] incoming request. Authorization header length:", authHeader ? authHeader.length : 0);
    if (authHeader) console.log("[api/run] Authorization prefix:", authHeader.slice(0, 30));

    // parse body safely
    let body: RunRequest | null = null;
    try {
      body = (await req.json()) as RunRequest;
    } catch (err) {
      console.error("[api/run] failed to parse JSON body:", err);
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body) return NextResponse.json({ error: "Missing request body" }, { status: 400 });

    const { contestId, questionId, language, code, quick } = body;
    if (!contestId || !questionId || !language || !code) {
      return NextResponse.json({ error: "contestId, questionId, language and code are required" }, { status: 400 });
    }

    // extract token
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) {
      console.warn("[api/run] Missing Authorization Bearer token.");
      return NextResponse.json({ error: "Missing Authorization token" }, { status: 401 });
    }

    // verify token
    let decoded: admin.auth.DecodedIdToken;
    try {
      decoded = await admin.auth().verifyIdToken(idToken);
      console.log("[api/run] verifyIdToken OK uid:", decoded.uid);
    } catch (err: any) {
      console.error("[api/run] verifyIdToken failed. err.name:", err?.name, "err.code:", err?.code, "err.message:", err?.message);
      return NextResponse.json({ error: "Invalid auth token", details: String(err?.message ?? err) }, { status: 401 });
    }

    const uid = decoded.uid;

    // fetch testcases for the question
    const tcsRef = db
      .collection("contests")
      .doc(contestId)
      .collection("questions")
      .doc(questionId)
      .collection("testcases");
    const tcsSnap = await tcsRef.orderBy("order", "asc").get();

    if (tcsSnap.empty) {
      console.warn("[api/run] no testcases found for", { contestId, questionId });
      return NextResponse.json({ error: "No testcases found for this question" }, { status: 400 });
    }

    const tcs = tcsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

    // choose tests (quick => only first test)
    const runTests = quick ? tcs.slice(0, 1) : tcs;

    type Result = { stdout: string | null; stderr: string | null; passed: boolean; error?: string | null };

    const results: Result[] = [];

    // run each test through Piston
    for (const tc of runTests) {
      try {
        const payload = {
          language,
          version: tc.runnerVersion || "*",
          files: [{ name: "Main", content: code }],
          stdin: String(tc.input ?? ""),
        };

        const runnerRes = await fetch(PISTON_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!runnerRes.ok) {
          const txt = await runnerRes.text().catch(() => "");
          console.error("[api/run] piston returned non-OK:", runnerRes.status, txt.slice(0, 200));
          results.push({ stdout: null, stderr: null, passed: false, error: `Runner error ${runnerRes.status}` });
          continue;
        }

        const runBody = await runnerRes.json().catch((e) => {
          console.error("[api/run] failed to parse piston JSON:", e);
          return null;
        });
        if (!runBody) {
          results.push({ stdout: null, stderr: null, passed: false, error: "Runner returned invalid JSON" });
          continue;
        }

        const run = runBody.run ?? runBody;
        const stdoutRaw = run?.stdout ?? run?.output ?? runBody.stdout ?? "";
        const stderrRaw = run?.stderr ?? runBody.stderr ?? null;

        const actualTrim = String(stdoutRaw ?? "").trim();
        const expectedTrim = String(tc.expectedOutput ?? "").trim();

        // strict equality of trimmed output (customize if you want whitespace-tolerant compare)
        const passed = expectedTrim !== "" ? actualTrim === expectedTrim : false;

        results.push({ stdout: truncate(actualTrim, 10000), stderr: truncate(stderrRaw ?? "", 10000), passed, error: null });
      } catch (err: any) {
        console.error("[api/run] runner call failed:", err);
        results.push({ stdout: null, stderr: null, passed: false, error: String(err?.message ?? err) });
      }
    }

    const passedCount = results.filter((r) => r.passed).length;
    const total = results.length;
    const finalStatus = passedCount === total ? "correct" : "incorrect";

    // save submission (server authoritative)
    const submissionRef = db.collection("submissions").doc();
    const submissionDoc = {
      contestId,
      questionId,
      userId: uid,
      code: truncate(code, 200000), // keep code size reasonable
      language,
      status: finalStatus,
      testSummary: { passedCount, total },
      results: results.map((r) => ({ stdout: r.stdout, stderr: r.stderr, passed: r.passed, error: r.error })),
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
      // audit: store who triggered run (user)
      triggeredBy: uid,
      quick: !!quick,
    };

    await submissionRef.set(submissionDoc);

    const clientPayload = {
      submissionId: submissionRef.id,
      testSummary: { passedCount, total },
      status: finalStatus,
      outputs: results.map((r, i) => ({ index: i, stdout: r.stdout, stderr: r.stderr, passed: r.passed, error: r.error })),
    };

    console.log("[api/run] submission saved id:", submissionRef.id, "status:", finalStatus, "passed:", passedCount, "/", total);

    return NextResponse.json(clientPayload, { status: 200 });
  } catch (err: any) {
    console.error("[api/run] unexpected error:", err);
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}
