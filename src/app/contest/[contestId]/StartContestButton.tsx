"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface StartContestButtonProps {
  contestId: string;
  userId: string;
  duration: number;
  level: number; // 👈 added
}

export default function StartContestButton({ contestId, userId, duration, level }: StartContestButtonProps) {
  const router = useRouter();

  const handleStartContest = async () => {
    try {
      await setDoc(
        doc(db, `user_contests/${userId}_${contestId}`),
        {
          status: "started",
          startedAt: serverTimestamp(),
          duration,
          startedLevel: level, // 👈 save selected level
        },
        { merge: true }
      );

      // Redirect with level param
      router.push(`/contest/${contestId}/live?userId=${userId}&level=${level}`);
    } catch (err) {
      console.error(err);
      alert("Failed to start contest. Please try again.");
    }
  };

  return (
    <Button size="lg" onClick={handleStartContest}>
      Start Level {level} <ArrowRight className="ml-2 h-5 w-5" />
    </Button>
  );
}
