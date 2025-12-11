// src/lib/types.ts

import type { User as FirebaseUser } from "firebase/auth";

/**
 * User document (in Firestore)
 */
export interface User {
  uid: string;
  email: string | null;
  name: string | null;
  regNo: string | null;
  department: string | null;
  role: "admin" | "user";
}

/**
 * Contest document
 */
export interface Contest {
  id: string;
  name: string;
  duration: number; // minutes
  createdBy: string;
  createdAt: any; // firestore Timestamp | Date — keep any for flexibility
}

/**
 * Question document
 */
export interface Question {
  id: string;
  contestId: string;
  title: string;
  description: string;
  constraints: string;
  sampleInput: string;
  sampleOutput: string;
  level: 1 | 2 | 3;
}

/**
 * Submission document
 */
export interface Submission {
  id: string;
  contestId: string;
  questionId: string;
  userId: string;
  code: string;
  language: string;
  status: "correct" | "incorrect";
  submittedAt: any; // firestore Timestamp | Date
}

/**
 * Leaderboard entry (used in UI)
 * - includes regNo & department for display convenience
 */
export interface LeaderboardEntry {
  id: string; // same as user doc id
  userId: string;
  userName: string;
  regNo?: string | null;
  department?: string | null;
  contestId: string;
  score: number;
  rank?: number;
}

/**
 * Auth context shape (for your auth provider)
 */
export interface AuthContextType {
  user: FirebaseUser | null;
  userData: User | null;
  role: "admin" | "user" | null;
  loading: boolean;
}
