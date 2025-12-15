// app/api/execute/route.ts
import { NextResponse } from "next/server";

type ReqBody = {
  language: string; // e.g. "python3", "javascript"
  code: string;
  stdin?: string;
  version?: string;
};

export async function POST(req: Request) {
  try {
    const body: ReqBody = await req.json();

    if (!body.language || !body.code) {
      return NextResponse.json({ error: "language and code are required" }, { status: 400 });
    }

    const PISTON_URL = process.env.PISTON_URL || "https://emkc.org/api/v2/piston/execute";

    const res = await fetch(PISTON_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language: body.language,
        version: body.version || "*",
        files: [{ name: "main", content: body.code }],
        stdin: body.stdin || "",
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      return NextResponse.json({ error: "Piston error", details: txt }, { status: 502 });
    }

    const data = await res.json();

    // optional: truncate large outputs before returning (uncomment if desired)
    // const truncate = (s = "", n = 10000) => (s.length > n ? s.slice(0, n) + "\n...[truncated]" : s);
    // if (data?.run?.stdout) data.run.stdout = truncate(String(data.run.stdout));
    // if (data?.run?.stderr) data.run.stderr = truncate(String(data.run.stderr));

    return NextResponse.json(data);
  } catch (err: any) {
    console.error("Execute error:", err);
    return NextResponse.json({ error: err.message || "unknown error" }, { status: 500 });
  }
}
