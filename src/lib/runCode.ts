// src/lib/runCode.ts
export type RunResult = {
  run?: {
    output?: string;
    stdout?: string;
    stderr?: string;
    code?: number;
    signal?: string | null;
  };
  compile?: any;
  language?: string;
  version?: string;
  error?: string;
};

export async function runCode(language: string, code: string, stdin = ''): Promise<RunResult> {
  const res = await fetch('/api/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language, code, stdin }),
  });

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.error || `Execute failed with status ${res.status}`);
  }
  return res.json();
}
