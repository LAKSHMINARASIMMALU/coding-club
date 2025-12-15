"use client";

import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Swords, Trophy, Loader2 } from "lucide-react";
import { useAuth } from '@/hooks/use-auth';

export default function Dashboard() {
  const { userData } = useAuth();
  const [stats, setStats] = useState({ users: 0, contests: 0, submissions: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const contestsSnapshot = await getDocs(collection(db, 'contests'));
        const submissionsSnapshot = await getDocs(collection(db, 'submissions'));

        setStats({
          users: usersSnapshot.size,
          contests: contestsSnapshot.size,
          submissions: submissionsSnapshot.size,
        });
      } catch (error) {
        console.error("Error fetching stats: ", error);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);
  
  return (
    <div className="flex-1 space-y-4">
       <h1 className="text-3xl font-bold tracking-tight">Welcome, {userData?.name || 'Admin'}!</h1>
       <p className="text-muted-foreground">Here's a snapshot of CodeContest Arena.</p>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : <div className="text-2xl font-bold">{stats.users}</div>}
            <p className="text-xs text-muted-foreground">Registered members on the platform</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Contests</CardTitle>
            <Swords className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : <div className="text-2xl font-bold">{stats.contests}</div>}
            <p className="text-xs text-muted-foreground">Live and upcoming contests</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Submissions</CardTitle>
            <Trophy className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : <div className="text-2xl font-bold">{stats.submissions}</div>}
            <p className="text-xs text-muted-foreground">Code submissions across all contests</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
