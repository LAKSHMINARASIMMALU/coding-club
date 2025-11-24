// File: pages/api/violation.ts
import type { NextApiRequest, NextApiResponse } from 'next';
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const authHeader = req.headers.authorization;
  let uid: string | null = null;

  try {
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
      ip: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || null,
    } as any;

    await db.collection('contest_violations').add(record);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('violation handler error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
