import { doc, getDoc, collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { notFound } from 'next/navigation';
import type { Contest, Question } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, HelpCircle } from 'lucide-react';
import StartContestButton from './StartContestButton';

async function getContestDetails(contestId: string, userId: string) {
    const contestRef = doc(db, 'contests', contestId);
    const contestSnap = await getDoc(contestRef);

    if (!contestSnap.exists()) return null;
    const contest = { id: contestSnap.id, ...contestSnap.data() } as Contest;

    const questionsQuery = query(collection(db, `contests/${contestId}/questions`), orderBy('level'));
    const questionsSnap = await getDocs(questionsQuery);
    const questions = questionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Question));

    // Check if user already attempted or ended contest
    const userContestRef = doc(db, `user_contests/${userId}_${contestId}`);
    const userContestSnap = await getDoc(userContestRef);
    const isLocked = userContestSnap.exists() && userContestSnap.data()?.status === 'ended';

    // Also read allowedLevels if any (so we can hint which levels user already started)
    const allowedLevels: number[] = userContestSnap.exists() ? (userContestSnap.data()?.allowedLevels ?? []) : [];

    return { contest, questions, isLocked, allowedLevels };
}

export default async function ContestPage({ params, searchParams }: { params: { contestId: string }, searchParams: any }) {
    const userId = searchParams.userId as string; // pass userId from auth
    const data = await getContestDetails(params.contestId, userId);

    if (!data) notFound();

    const { contest, questions, isLocked, allowedLevels } = data;

    // Group questions into buckets for Level 1, 2, 3; other levels go to "Other"
    const levelOrder = [1, 2, 3];
    const grouped: { level: number; items: Question[] }[] = levelOrder.map(lvl => ({
      level: lvl,
      items: questions.filter(q => Number(q?.level) === lvl)
    }));
    const otherQuestions = questions.filter(q => !levelOrder.includes(Number(q?.level)));

    // Optional counts
    const totalByLevel = (lvl: number) => grouped.find(g => g.level === lvl)?.items.length ?? 0;
    const totalOther = otherQuestions.length;

    return (
        <div className="container mx-auto max-w-4xl py-8">
            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle className="text-4xl font-headline text-center">{contest.name}</CardTitle>
                    <CardDescription className="text-center text-lg flex items-center justify-center gap-2 pt-2">
                        <Clock className="h-5 w-5" /> {contest.duration} minutes
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="mb-8">
                        <h3 className="text-2xl font-semibold mb-4 flex items-center">
                            <HelpCircle className="h-6 w-6 mr-3 text-primary" />
                            Questions
                        </h3>

                        {/* Levels sections */}
                        <div className="space-y-6">
                          {grouped.map(group => (
                            <section key={group.level} className="bg-muted/40 rounded-md p-3">
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="font-semibold">Level {group.level}</h4>
                                <div className="flex items-center gap-3">
                                  <div className="text-sm text-muted-foreground">{totalByLevel(group.level)} question{totalByLevel(group.level) !== 1 ? 's' : ''}</div>

                                  {/* Start button for this level */}
                                  <StartContestButton
                                    contestId={contest.id}
                                    userId={userId}
                                    duration={contest.duration}
                                    level={group.level}
                                    disabled={isLocked || group.items.length === 0}
                                  />

                                  {/* indicator if already allowed */}
                                  {allowedLevels?.includes(group.level) && (
                                    <div className="text-xs text-green-700 font-medium">Started</div>
                                  )}
                                </div>
                              </div>

                              {group.items.length === 0 ? (
                                <div className="px-3 py-2 text-sm text-muted-foreground">No questions for Level {group.level}.</div>
                              ) : (
                                <div className="grid gap-2">
                                  {group.items.map((q, idx) => (
                                    <div key={q.id} className="flex items-center justify-between p-3 rounded-md bg-secondary/50">
                                      <div className="flex items-center gap-3">
                                        <div className="text-sm font-medium">Q{idx + 1}: {q.title}</div>
                                      </div>
                                      <div className={`text-sm font-semibold px-2 py-1 rounded-full ${
                                        q.level === 1 ? 'bg-green-100 text-green-800' :
                                        q.level === 2 ? 'bg-yellow-100 text-yellow-800' :
                                        'bg-red-100 text-red-800'
                                      }`}>
                                        Level {q.level}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </section>
                          ))}

                          {/* Other Levels */}
                          {totalOther > 0 && (
                            <section className="bg-muted/40 rounded-md p-3">
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="font-semibold">Other Levels</h4>
                                <div className="flex items-center gap-3">
                                  <div className="text-sm text-muted-foreground">{totalOther} question{totalOther !== 1 ? 's' : ''}</div>

                                  <StartContestButton
                                    contestId={contest.id}
                                    userId={userId}
                                    duration={contest.duration}
                                    level={"other"}
                                    disabled={isLocked || totalOther === 0}
                                  />

                                  {allowedLevels && allowedLevels.length > 0 && (
                                    <div className="text-xs text-green-700 font-medium">Started</div>
                                  )}
                                </div>
                              </div>

                              <div className="grid gap-2">
                                {otherQuestions.map((q, idx) => (
                                  <div key={q.id} className="flex items-center justify-between p-3 rounded-md bg-secondary/50">
                                    <div className="text-sm font-medium">Q{idx + 1}: {q.title}</div>
                                    <div className="text-xs text-muted-foreground">Level: {q.level ?? '—'}</div>
                                  </div>
                                ))}
                              </div>
                            </section>
                          )}
                        </div>
                    </div>

                    {/* ---------- REMOVED the generic bottom StartContestButton ---------- */}
                    <div className="mt-8 border-t pt-6 text-center space-y-4">
                        {isLocked ? (
                            <p className="text-red-600 font-semibold">
                                You have already completed this contest. You cannot participate again.
                            </p>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                              Start a specific level above to begin the contest.
                            </p>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
