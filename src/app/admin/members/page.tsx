"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, where, doc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { User } from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Trash2, Loader2, UserX } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Card } from "@/components/ui/card";

export default function MembersPage() {
  const [members, setMembers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const fetchMembers = async () => {
    setIsLoading(true);
    try {
      const q = query(collection(db, "users"), where("role", "==", "user"));
      const querySnapshot = await getDocs(q);
      const membersList = querySnapshot.docs.map(doc => ({ ...doc.data() } as User));
      setMembers(membersList);
    } catch (error) {
      console.error("Error fetching members:", error);
      toast({ variant: "destructive", title: "Failed to fetch members." });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  const handleRemoveMember = async (uid: string) => {
    // Note: This only deletes the Firestore record.
    // For a full implementation, you would also need a Firebase Function
    // to delete the user from Firebase Authentication.
    try {
        await deleteDoc(doc(db, "users", uid));
        toast({ title: "Member Removed", description: "The user has been removed from the platform."});
        fetchMembers();
    } catch(error) {
        console.error("Error removing member:", error);
        toast({ variant: "destructive", title: "Failed to remove member." });
    }
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
            <h1 className="text-3xl font-bold tracking-tight">Member Management</h1>
            <p className="text-muted-foreground">View and manage all registered platform users.</p>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Registration No.</TableHead>
              <TableHead>Department</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center">
                  <Loader2 className="mx-auto my-8 h-6 w-6 animate-spin text-primary" />
                </TableCell>
              </TableRow>
            ) : members.length > 0 ? (
              members.map((member) => (
                <TableRow key={member.uid}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage src={`https://avatar.vercel.sh/${member.email}.png`} alt={member.name || ''} />
                        <AvatarFallback>{getInitials(member.name)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">{member.name}</div>
                        <div className="text-sm text-muted-foreground">{member.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{member.regNo}</TableCell>
                  <TableCell>{member.department}</TableCell>
                  <TableCell className="text-right">
                  <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon">
                            <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                          <AlertDialogHeader>
                          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                          <AlertDialogDescription>
                              This will remove the user's data from the platform. This action cannot be undone.
                              (Note: This does not delete their authentication record, which requires a Firebase Function).
                          </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleRemoveMember(member.uid)} className="bg-destructive hover:bg-destructive/90">Remove Member</AlertDialogAction>
                          </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))
            ) : (
                <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">
                        <UserX className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                        No members found.
                    </TableCell>
                </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
