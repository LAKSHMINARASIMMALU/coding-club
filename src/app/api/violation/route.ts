// File: app/api/violation/route.ts
import { NextResponse } from 'next/server';
import admin from 'firebase-admin';

if (!admin.apps.length) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccount) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(serviceAccount)),
      });
    } catch (e) {
      console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:", e);
      admin.initializeApp();
    }
  } else {
    admin.initializeApp();
  }
}

const db = admin.firestore();

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const authHeader = req.headers.get('authorization') || '';
    let uid: string | null = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const idToken = authHeader.split(' ')[1];
      try {
        const decoded = await admin.auth().verifyIdToken(idToken);
        uid = decoded.uid;
      } catch (e) {
        console.warn('Invalid ID token', e);
      }
    }

    const record = {
      contestId: body.contestId || null,
      userId: uid ?? body.userId ?? null,
      tabId: body.tabId ?? null,
      type: body.type ?? 'unknown',
      detail: body.detail ?? null,
      clientTs: body.ts ? new Date(body.ts) : new Date(),
      serverTs: admin.firestore.FieldValue.serverTimestamp(),
      ip: (req.headers.get('x-forwarded-for')) || null,
    } as any;

    await db.collection('contest_violations').add(record);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('violation route error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
