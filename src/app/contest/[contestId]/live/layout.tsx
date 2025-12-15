"use client";

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogHeader,
    AlertDialogTitle,
  } from "@/components/ui/alert-dialog"
import { useState } from 'react';

export default function LiveContestLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const { toast } = useToast();
    const [isCheating, setIsCheating] = useState(false);
    const hasShownToast = useRef(false);

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden && !hasShownToast.current) {
                hasShownToast.current = true;
                setIsCheating(true);
                toast({
                    variant: 'destructive',
                    title: 'Tab Switch Detected!',
                    description: 'Your contest has been terminated due to a violation of the rules.',
                    duration: 10000,
                });
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Prevent right-click to open context menu
        const handleContextMenu = (e: MouseEvent) => e.preventDefault();
        document.addEventListener('contextmenu', handleContextMenu);


        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            document.removeEventListener('contextmenu', handleContextMenu);
        };
    }, [router, toast]);


    return (
        <>
            <AlertDialog open={isCheating}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                    <AlertDialogTitle>Contest Terminated</AlertDialogTitle>
                    <AlertDialogDescription>
                        You have switched tabs or windows, which is against the rules.
                        Your contest has been automatically submitted and you will be redirected to your dashboard.
                    </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogAction onClick={() => router.replace('/dashboard')}>
                        Return to Dashboard
                    </AlertDialogAction>
                </AlertDialogContent>
            </AlertDialog>
            <div className={`${isCheating ? 'pointer-events-none blur-sm' : ''}`}>
                 {children}
            </div>
        </>
    );
}
