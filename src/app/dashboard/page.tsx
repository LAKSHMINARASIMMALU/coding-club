"use client";
import img1 from '@/images/code1.png';
import img2 from '@/images/code2.png';
import img3 from '@/images/code3.png';

const codingImages = [img1, img2, img3];
const img = codingImages[Math.floor(Math.random() * codingImages.length)];


import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, getDocs, query, orderBy, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import type { Contest } from "@/lib/types";

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Swords, Clock } from "lucide-react";
import Image from "next/image";

export default function Dashboard() {
  const { userData } = useAuth();
  const [contests, setContests] = useState<Contest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [disabledContests, setDisabledContests] = useState<string[]>([]); // contests user can't enter

  useEffect(() => {
    const fetchContests = async () => {
      setIsLoading(true);
      try {
        const q = query(collection(db, "contests"), orderBy("createdAt", "desc"));
        const contestsSnapshot = await getDocs(q);
        const contestsList = contestsSnapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() } as Contest)
        );
        setContests(contestsList);

        if (userData?.uid) {
          // Check user_contests to see which contests are ended
          const disabled: string[] = [];
          for (const contest of contestsList) {
            const userContestRef = doc(db, "user_contests", `${userData.uid}_${contest.id}`);
            const userContestSnap = await getDoc(userContestRef);
            if (userContestSnap.exists() && userContestSnap.data()?.status === "ended") {
              disabled.push(contest.id);
            }
          }
          setDisabledContests(disabled);
        }
      } catch (error) {
        console.error("Error fetching contests:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchContests();
  }, [userData?.uid]);

  return (
    <div className="container mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Welcome, {userData?.name}!</h1>
        <p className="text-muted-foreground">Choose a contest below to test your skills.</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      ) : contests.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {contests.map((contest) => {
            const isDisabled = disabledContests.includes(contest.id);
            return (
              <Card
                key={contest.id}
                className={`flex flex-col overflow-hidden transition-transform hover:scale-105 duration-300 ${
                  isDisabled ? "opacity-50 cursor-not-allowed hover:scale-100" : ""
                }`}
              >
                <div className="relative h-48 w-full">
                  <Image
  src={img}
  alt={contest.name}
  fill
  className="object-cover"
/>



                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                </div>
                <CardHeader>
                  <CardTitle className="text-xl font-headline">{contest.name}</CardTitle>
                  <CardDescription className="flex items-center gap-2 pt-1">
                    <Clock className="h-4 w-4" />
                    <span>{contest.duration} minutes</span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-grow">
                  <p className="text-sm text-muted-foreground">
                    Ready to prove your coding prowess? Jump in and start solving challenges.
                  </p>
                </CardContent>
                <CardFooter>
                  <Button asChild className="w-full" disabled={isDisabled}>
                    <Link href={isDisabled ? "#" : `/contest/${contest.id}`}>View Contest</Link>
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center text-center h-64 rounded-lg border-2 border-dashed">
          <Swords className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold">No Contests Available</h2>
          <p className="text-muted-foreground mt-2">Please check back later for new challenges.</p>
        </div>
      )}
    </div>
  );
}
