"use client";

import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  writeBatch,
  Timestamp,
  query,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";
import type { Contest, Question } from "@/lib/types";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlusCircle, Trash2, Loader2, X, Edit2 } from "lucide-react";
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

/**
 * New structured question format:
 * - inputs: [{ name: string, type: 'int'|'string'|'array', example: string }]
 * - sampleInputs: string[]  (each sample input can contain newline text)
 * - sampleOutputs: string[] (parallel to sampleInputs length or independent)
 */
type QuestionInput = {
  name: string;
  type: "int" | "string" | "array";
  example: string;
};

type NewQuestion = Omit<Question, "id" | "contestId"> & {
  inputs?: QuestionInput[];
  sampleInputs?: string[];
  sampleOutputs?: string[];
};

export default function ContestsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [contests, setContests] = useState<Contest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Create dialog states
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newContestName, setNewContestName] = useState("");
  const [newContestDuration, setNewContestDuration] = useState(60);
  const [questions, setQuestions] = useState<NewQuestion[]>([]);
  const [newStartAt, setNewStartAt] = useState<string | null>(null); // "YYYY-MM-DDTHH:MM"
  const [newEndAt, setNewEndAt] = useState<string | null>(null);

  // Edit dialog states
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingContestId, setEditingContestId] = useState<string | null>(null);
  const [editContestName, setEditContestName] = useState("");
  const [editContestDuration, setEditContestDuration] = useState(60);
  const [editQuestions, setEditQuestions] = useState<NewQuestion[]>([]);
  const [editStartAt, setEditStartAt] = useState<string | null>(null);
  const [editEndAt, setEditEndAt] = useState<string | null>(null);

  // ---------- Question Editor (single-question edit modal) ----------
  const [questionEditorOpen, setQuestionEditorOpen] = useState(false);
  const [editorQuestionIndex, setEditorQuestionIndex] = useState<number | null>(null);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create"); // which array we edit
  const [editorQuestion, setEditorQuestion] = useState<NewQuestion | null>(null);

  const openQuestionEditorForCreate = (index: number) => {
    setEditorMode("create");
    setEditorQuestionIndex(index);
    setEditorQuestion({ ...(questions[index] || {}) });
    setQuestionEditorOpen(true);
  };

  const openQuestionEditorForEdit = (index: number) => {
    setEditorMode("edit");
    setEditorQuestionIndex(index);
    setEditorQuestion({ ...(editQuestions[index] || {}) });
    setQuestionEditorOpen(true);
  };

  const closeQuestionEditor = () => {
    setQuestionEditorOpen(false);
    setEditorQuestionIndex(null);
    setEditorQuestion(null);
  };

  const handleEditorFieldChange = (field: keyof NewQuestion, value: any) => {
    setEditorQuestion((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  // Editor helpers for inputs and samples (local to editor)
  const editorAddInput = () => {
    setEditorQuestion((prev) =>
      prev
        ? { ...prev, inputs: [...(prev.inputs || []), { name: "", type: "int", example: "" }] }
        : prev
    );
  };
  const editorRemoveInput = (i: number) => {
    setEditorQuestion((prev) =>
      prev ? { ...prev, inputs: (prev.inputs || []).filter((_, idx) => idx !== i) } : prev
    );
  };
  const editorChangeInput = (i: number, field: keyof QuestionInput, value: any) => {
    setEditorQuestion((prev) => {
      if (!prev) return prev;
      const inputs = [...(prev.inputs || [])];
      inputs[i] = { ...inputs[i], [field]: value };
      return { ...prev, inputs };
    });
  };

  const editorAddSamplePair = () => {
    setEditorQuestion((prev) =>
      prev
        ? {
            ...prev,
            sampleInputs: [...(prev.sampleInputs || []), ""],
            sampleOutputs: [...(prev.sampleOutputs || []), ""],
          }
        : prev
    );
  };
  const editorRemoveSamplePair = (i: number) => {
    setEditorQuestion((prev) =>
      prev
        ? {
            ...prev,
            sampleInputs: (prev.sampleInputs || []).filter((_, idx) => idx !== i),
            sampleOutputs: (prev.sampleOutputs || []).filter((_, idx) => idx !== i),
          }
        : prev
    );
  };
  const editorChangeSampleInput = (i: number, value: string) => {
    setEditorQuestion((prev) =>
      prev ? { ...prev, sampleInputs: (prev.sampleInputs || []).map((v, idx) => (idx === i ? value : v)) } : prev
    );
  };
  const editorChangeSampleOutput = (i: number, value: string) => {
    setEditorQuestion((prev) =>
      prev ? { ...prev, sampleOutputs: (prev.sampleOutputs || []).map((v, idx) => (idx === i ? value : v)) } : prev
    );
  };

  const saveEditorChanges = () => {
    if (editorQuestionIndex == null || !editorQuestion) {
      closeQuestionEditor();
      return;
    }
    if (editorMode === "create") {
      const updated = [...questions];
      updated[editorQuestionIndex] = editorQuestion;
      setQuestions(updated);
    } else {
      const updated = [...editQuestions];
      updated[editorQuestionIndex] = editorQuestion;
      setEditQuestions(updated);
    }
    closeQuestionEditor();
  };

  // ---------- end Question Editor ----------

  const fetchContests = async () => {
    setIsLoading(true);
    try {
      const contestsSnapshot = await getDocs(collection(db, "contests"));
      const contestsList = contestsSnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      })) as Contest[];
      setContests(contestsList);
      console.log("Fetched contests:", contestsList);
    } catch (error) {
      console.error("Error fetching contests:", error);
      toast({
        variant: "destructive",
        title: "Failed to fetch contests",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchContests();
  }, []);

  // helpers to convert between datetime-local string and Timestamp
  const datetimeLocalToTimestamp = (s: string | null) =>
    s ? Timestamp.fromDate(new Date(s)) : null;

  const timestampToDatetimeLocal = (ts: any /* Timestamp | undefined */) => {
    try {
      if (!ts) return null;
      // if ts has toDate function
      const d = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
      // produce yyyy-MM-ddTHH:mm format
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return null;
    }
  };

  // ---------- Create logic ----------
  const handleAddQuestion = () => {
    setQuestions([
      ...questions,
      {
        title: "",
        description: "",
        constraints: "",
        sampleInput: "",
        sampleOutput: "",
        level: 1,
        inputs: [],
        sampleInputs: [],
        sampleOutputs: [],
      },
    ]);
  };

  const handleRemoveQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const handleQuestionChange = (
    index: number,
    field: keyof NewQuestion,
    value: any
  ) => {
    const updatedQuestions = [...questions];
    updatedQuestions[index] = { ...updatedQuestions[index], [field]: value };
    setQuestions(updatedQuestions);
  };

  // Inputs management (create)
  const handleAddInput = (qIndex: number) => {
    const updated = [...questions];
    const q = { ...(updated[qIndex] || ({} as NewQuestion)) };
    q.inputs = q.inputs ? [...q.inputs, { name: "", type: "int", example: "" }] : [{ name: "", type: "int", example: "" }];
    updated[qIndex] = q;
    setQuestions(updated);
  };

  const handleRemoveInput = (qIndex: number, inputIndex: number) => {
    const updated = [...questions];
    updated[qIndex].inputs = (updated[qIndex].inputs || []).filter((_, i) => i !== inputIndex);
    setQuestions(updated);
  };

  const handleInputChange = (qIndex: number, inputIndex: number, field: keyof QuestionInput, value: any) => {
    const updated = [...questions];
    const inputs = updated[qIndex].inputs ? [...updated[qIndex].inputs!] : [];
    inputs[inputIndex] = { ...inputs[inputIndex], [field]: value } as QuestionInput;
    updated[qIndex].inputs = inputs;
    setQuestions(updated);
  };

  // Sample IO management (create) - we'll keep arrays sampleInputs and sampleOutputs
  const handleAddSamplePair = (qIndex: number) => {
    const updated = [...questions];
    updated[qIndex].sampleInputs = updated[qIndex].sampleInputs || [];
    updated[qIndex].sampleOutputs = updated[qIndex].sampleOutputs || [];
    updated[qIndex].sampleInputs!.push("");
    updated[qIndex].sampleOutputs!.push("");
    setQuestions(updated);
  };

  const handleRemoveSamplePair = (qIndex: number, sampleIndex: number) => {
    const updated = [...questions];
    updated[qIndex].sampleInputs = (updated[qIndex].sampleInputs || []).filter((_, i) => i !== sampleIndex);
    updated[qIndex].sampleOutputs = (updated[qIndex].sampleOutputs || []).filter((_, i) => i !== sampleIndex);
    setQuestions(updated);
  };

  const handleSampleInputChange = (qIndex: number, sampleIndex: number, value: string) => {
    const updated = [...questions];
    updated[qIndex].sampleInputs = updated[qIndex].sampleInputs || [];
    updated[qIndex].sampleInputs![sampleIndex] = value;
    setQuestions(updated);
  };

  const handleSampleOutputChange = (qIndex: number, sampleIndex: number, value: string) => {
    const updated = [...questions];
    updated[qIndex].sampleOutputs = updated[qIndex].sampleOutputs || [];
    updated[qIndex].sampleOutputs![sampleIndex] = value;
    setQuestions(updated);
  };

  const handleCreateContest = async () => {
    if (!newContestName || newContestDuration <= 0 || questions.length === 0 || !user) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description:
          "Please fill in contest name, duration, start/end time and add at least one question.",
      });
      return;
    }
    if (!newStartAt || !newEndAt) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please select start and end date-time for the contest.",
      });
      return;
    }
    if (new Date(newStartAt) >= new Date(newEndAt)) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Start time must be before end time.",
      });
      return;
    }

    setIsLoading(true);
    try {
      const contestRef = await addDoc(collection(db, "contests"), {
        name: newContestName,
        duration: newContestDuration,
        createdBy: user.uid,
        createdAt: Timestamp.now(),
        startAt: datetimeLocalToTimestamp(newStartAt),
        endAt: datetimeLocalToTimestamp(newEndAt),
      });

      const batch = writeBatch(db);
      questions.forEach((q) => {
        const questionRef = doc(
          collection(db, `contests/${contestRef.id}/questions`)
        );
        // ensure normalized fields are saved
        const payload: any = {
          title: q.title || "",
          description: q.description || "",
          constraints: q.constraints || "",
          level: q.level || 1,
          inputs: q.inputs || [],
          sampleInputs: q.sampleInputs || [],
          sampleOutputs: q.sampleOutputs || [],
        };
        batch.set(questionRef, payload);
      });
      await batch.commit();

      toast({
        title: "Contest Created!",
        description: "The new contest has been added successfully.",
      });
      resetForm();
      fetchContests();
    } catch (error) {
      console.error("Error creating contest:", error);
      toast({
        variant: "destructive",
        title: "Failed to create contest",
      });
    } finally {
      setIsLoading(false);
      setIsDialogOpen(false);
    }
  };

  // ---------- Delete logic ----------
  const handleDeleteContest = async (contestId: string) => {
    setIsLoading(true);
    try {
      // Delete questions subcollection
      const questionsQuery = query(
        collection(db, `contests/${contestId}/questions`)
      );
      const questionsSnapshot = await getDocs(questionsQuery);
      const batch = writeBatch(db);
      questionsSnapshot.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });
      await batch.commit();

      // Delete contest document
      await deleteDoc(doc(db, "contests", contestId));

      toast({
        title: "Contest Deleted",
        description: "The contest and its questions have been removed.",
      });
      fetchContests();
    } catch (error) {
      console.error("Error deleting contest:", error);
      toast({
        variant: "destructive",
        title: "Failed to delete contest",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setNewContestName("");
    setNewContestDuration(60);
    setQuestions([]);
    setNewStartAt(null);
    setNewEndAt(null);
  };

  // ---------- Edit logic ----------
  const canEdit = (contest: Contest) => {
    return user && (user.isAdmin || user.uid === contest.createdBy);
  };

  const openEditDialog = async (contest: Contest) => {
    setEditingContestId(contest.id);
    setEditContestName(contest.name || "");
    setEditContestDuration(contest.duration || 60);
    setEditStartAt(timestampToDatetimeLocal((contest as any).startAt));
    setEditEndAt(timestampToDatetimeLocal((contest as any).endAt));
    setIsLoading(true);
    try {
      // fetch questions for this contest
      const qSnap = await getDocs(
        collection(db, `contests/${contest.id}/questions`)
      );
      const fetchedQuestions = qSnap.docs.map((d) => {
        const data = d.data() as any;
        return {
          title: data.title || "",
          description: data.description || "",
          constraints: data.constraints || "",
          level: data.level || 1,
          inputs: data.inputs || [],
          sampleInputs: data.sampleInputs || [],
          sampleOutputs: data.sampleOutputs || [],
        } as NewQuestion;
      });
      setEditQuestions(fetchedQuestions.length ? fetchedQuestions : []);
      setEditDialogOpen(true);
    } catch (error) {
      console.error("Error fetching contest questions for edit:", error);
      toast({
        variant: "destructive",
        title: "Failed to load contest for editing",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Edit inputs & sample IO handlers (same as create but operate on editQuestions)
  const handleEditAddQuestion = () => {
    setEditQuestions([
      ...editQuestions,
      {
        title: "",
        description: "",
        constraints: "",
        sampleInput: "",
        sampleOutput: "",
        level: 1,
        inputs: [],
        sampleInputs: [],
        sampleOutputs: [],
      },
    ]);
  };

  const handleEditRemoveQuestion = (index: number) => {
    setEditQuestions(editQuestions.filter((_, i) => i !== index));
  };

  const handleEditQuestionChange = (
    index: number,
    field: keyof NewQuestion,
    value: any
  ) => {
    const updated = [...editQuestions];
    updated[index] = { ...updated[index], [field]: value };
    setEditQuestions(updated);
  };

  const handleEditAddInput = (qIndex: number) => {
    const updated = [...editQuestions];
    const q = { ...(updated[qIndex] || ({} as NewQuestion)) };
    q.inputs = q.inputs ? [...q.inputs, { name: "", type: "int", example: "" }] : [{ name: "", type: "int", example: "" }];
    updated[qIndex] = q;
    setEditQuestions(updated);
  };

  const handleEditRemoveInput = (qIndex: number, inputIndex: number) => {
    const updated = [...editQuestions];
    updated[qIndex].inputs = (updated[qIndex].inputs || []).filter((_, i) => i !== inputIndex);
    setEditQuestions(updated);
  };

  const handleEditInputChange = (qIndex: number, inputIndex: number, field: keyof QuestionInput, value: any) => {
    const updated = [...editQuestions];
    const inputs = updated[qIndex].inputs ? [...updated[qIndex].inputs!] : [];
    inputs[inputIndex] = { ...inputs[inputIndex], [field]: value } as QuestionInput;
    updated[qIndex].inputs = inputs;
    setEditQuestions(updated);
  };

  const handleEditAddSamplePair = (qIndex: number) => {
    const updated = [...editQuestions];
    updated[qIndex].sampleInputs = updated[qIndex].sampleInputs || [];
    updated[qIndex].sampleOutputs = updated[qIndex].sampleOutputs || [];
    updated[qIndex].sampleInputs!.push("");
    updated[qIndex].sampleOutputs!.push("");
    setEditQuestions(updated);
  };

  const handleEditRemoveSamplePair = (qIndex: number, sampleIndex: number) => {
    const updated = [...editQuestions];
    updated[qIndex].sampleInputs = (updated[qIndex].sampleInputs || []).filter((_, i) => i !== sampleIndex);
    updated[qIndex].sampleOutputs = (updated[qIndex].sampleOutputs || []).filter((_, i) => i !== sampleIndex);
    setEditQuestions(updated);
  };

  const handleEditSampleInputChange = (qIndex: number, sampleIndex: number, value: string) => {
    const updated = [...editQuestions];
    updated[qIndex].sampleInputs = updated[qIndex].sampleInputs || [];
    updated[qIndex].sampleInputs![sampleIndex] = value;
    setEditQuestions(updated);
  };

  const handleEditSampleOutputChange = (qIndex: number, sampleIndex: number, value: string) => {
    const updated = [...editQuestions];
    updated[qIndex].sampleOutputs = updated[qIndex].sampleOutputs || [];
    updated[qIndex].sampleOutputs![sampleIndex] = value;
    setEditQuestions(updated);
  };

  const handleSaveEdit = async () => {
    if (!editingContestId) return;
    if (!editContestName || editContestDuration <= 0 || editQuestions.length === 0) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description:
          "Please fill in contest name, duration, and add at least one question.",
      });
      return;
    }
    if (!editStartAt || !editEndAt) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please select start and end date-time for the contest.",
      });
      return;
    }
    if (new Date(editStartAt) >= new Date(editEndAt)) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Start time must be before end time.",
      });
      return;
    }

    setIsLoading(true);
    try {
      // Update contest doc
      const contestRef = doc(db, "contests", editingContestId);
      await updateDoc(contestRef, {
        name: editContestName,
        duration: editContestDuration,
        startAt: datetimeLocalToTimestamp(editStartAt),
        endAt: datetimeLocalToTimestamp(editEndAt),
      });

      // Replace questions subcollection: delete existing then write new ones in a batch
      const qSnap = await getDocs(
        collection(db, `contests/${editingContestId}/questions`)
      );
      const batch = writeBatch(db);
      qSnap.forEach((docSnap) => batch.delete(docSnap.ref));
      editQuestions.forEach((q) => {
        const newQRef = doc(
          collection(db, `contests/${editingContestId}/questions`)
        );
        const payload: any = {
          title: q.title || "",
          description: q.description || "",
          constraints: q.constraints || "",
          level: q.level || 1,
          inputs: q.inputs || [],
          sampleInputs: q.sampleInputs || [],
          sampleOutputs: q.sampleOutputs || [],
        };
        batch.set(newQRef, payload);
      });
      await batch.commit();

      toast({
        title: "Contest Updated",
        description: "Changes saved successfully.",
      });

      fetchContests();
      setEditDialogOpen(false);
      setEditingContestId(null);
    } catch (error) {
      console.error("Error saving contest edits:", error);
      toast({
        variant: "destructive",
        title: "Failed to save changes",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // ---------- Rendering ----------
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Contest Management</h1>
          <p className="text-muted-foreground">Create, view, and manage all coding contests.</p>
        </div>
        <Dialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            if (!open) resetForm();
            setIsDialogOpen(open);
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" />
              Create Contest
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Contest</DialogTitle>
              <DialogDescription>
                Fill in the details for your new contest and add questions.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-6 py-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="name">Contest Name</Label>
                  <Input
                    id="name"
                    value={newContestName}
                    onChange={(e) => setNewContestName(e.target.value)}
                    className="col-span-3"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="duration">Duration (minutes)</Label>
                  <Input
                    id="duration"
                    type="number"
                    value={newContestDuration}
                    onChange={(e) => setNewContestDuration(parseInt(e.target.value))}
                    className="col-span-3"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Date & Time</Label>
                  <Input type="datetime-local" value={newStartAt ?? ""} onChange={(e) => setNewStartAt(e.target.value || null)} />
                </div>
                <div className="space-y-2">
                  <Label>End Date & Time</Label>
                  <Input type="datetime-local" value={newEndAt ?? ""} onChange={(e) => setNewEndAt(e.target.value || null)} />
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Questions</h3>
                {questions.map((q, index) => (
                  <div key={index} className="border rounded-lg p-4 space-y-4 relative">
                    <div className="absolute top-2 right-2 flex items-center space-x-1">
                      <Button variant="ghost" size="icon" onClick={() => openQuestionEditorForCreate(index)} title="Edit Question">
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleRemoveQuestion(index)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2 col-span-2">
                        <Label>Title</Label>
                        <Input value={q.title} onChange={(e) => handleQuestionChange(index, "title", e.target.value)} />
                      </div>

                      <div className="space-y-2">
                        <Label>Level</Label>
                        <Select value={q.level?.toString() ?? "1"} onValueChange={(val) => handleQuestionChange(index, "level", parseInt(val))}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select level" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1 - Easy</SelectItem>
                            <SelectItem value="2">2 - Medium</SelectItem>
                            <SelectItem value="3">3 - Hard</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Problem Description</Label>
                      <Textarea value={q.description} onChange={(e) => handleQuestionChange(index, "description", e.target.value)} />
                    </div>

                    <div className="space-y-2">
                      <Label>Constraints</Label>
                      <Textarea value={q.constraints} onChange={(e) => handleQuestionChange(index, "constraints", e.target.value)} />
                    </div>

                    {/* Inputs (name, type, example) */}
                    <div>
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">Inputs</h4>
                        <Button variant="outline" size="sm" onClick={() => handleAddInput(index)}>Add Input</Button>
                      </div>
                      {(q.inputs || []).map((inp, ii) => (
                        <div key={ii} className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end mt-2">
                          <div className="md:col-span-2">
                            <Label>Variable Name</Label>
                            <Input value={inp.name} onChange={(e) => handleInputChange(index, ii, "name", e.target.value)} />
                          </div>
                          <div className="md:col-span-2">
                            <Label>Type</Label>
                            <Select value={inp.type} onValueChange={(val) => handleInputChange(index, ii, "type", val as any)}>
                              <SelectTrigger>
                                <SelectValue placeholder="Type" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="int">int</SelectItem>
                                <SelectItem value="string">string</SelectItem>
                                <SelectItem value="array">array</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="md:col-span-2">
                            <Label>Example Value</Label>
                            <Input value={inp.example} onChange={(e) => handleInputChange(index, ii, "example", e.target.value)} placeholder={inp.type === "array" ? "e.g. 1,2,3" : "e.g. 42 or hello"} />
                          </div>
                          <div className="md:col-span-6 text-right">
                            <Button variant="ghost" size="icon" onClick={() => handleRemoveInput(index, ii)}><X className="h-4 w-4" /></Button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Sample input/output pairs */}
                    <div>
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">Sample Inputs & Outputs</h4>
                        <Button variant="outline" size="sm" onClick={() => handleAddSamplePair(index)}>Add Sample IO</Button>
                      </div>
                      {(q.sampleInputs || []).map((si, sidx) => (
                        <div key={sidx} className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                          <div>
                            <Label>Sample Input #{sidx + 1}</Label>
                            <Textarea value={si} onChange={(e) => handleSampleInputChange(index, sidx, e.target.value)} />
                          </div>
                          <div>
                            <Label>Sample Output #{sidx + 1}</Label>
                            <Textarea value={(q.sampleOutputs || [])[sidx] || ""} onChange={(e) => handleSampleOutputChange(index, sidx, e.target.value)} />
                          </div>
                          <div className="md:col-span-2 text-right">
                            <Button variant="ghost" size="icon" onClick={() => handleRemoveSamplePair(index, sidx)}><X className="h-4 w-4" /></Button>
                          </div>
                        </div>
                      ))}
                    </div>

                  </div>
                ))}

                <Button variant="outline" onClick={handleAddQuestion}>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Add Question
                </Button>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateContest} disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Contest
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Contests table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contest Name</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Start — End</TableHead>
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
            ) : contests.length > 0 ? (
              contests.map((contest) => (
                <TableRow key={contest.id}>
                  <TableCell className="font-medium">{contest.name}</TableCell>
                  <TableCell>{contest.duration} mins</TableCell>
                  <TableCell>
                    {contest.startAt ? new Date((contest as any).startAt.toDate()).toLocaleString() : "—"}{" "}
                    — {contest.endAt ? new Date((contest as any).endAt.toDate()).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end items-center space-x-2">
                      {/* TEMP VISIBLE EDIT BUTTON — makes it obvious during debugging */}
                      <Button
                        size="sm"
                        onClick={() => {
                          console.log("openEditDialog called", { user, contest });
                          openEditDialog(contest);
                        }}
                        disabled={isLoading}
                        title="Edit Contest (temp visible)"
                      >
                        <Edit2 className="mr-2 h-4 w-4" />
                        Edit
                      </Button>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" disabled={isLoading}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This action cannot be undone. This will permanently delete the contest
                              and all its questions.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteContest(contest.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="text-center h-24">
                  No contests found. Create one to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setEditingContestId(null);
          setEditQuestions([]);
        }
        setEditDialogOpen(open);
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Contest</DialogTitle>
            <DialogDescription>Modify contest details and questions.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label>Contest Name</Label>
                <Input value={editContestName} onChange={(e) => setEditContestName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Duration (minutes)</Label>
                <Input type="number" value={editContestDuration} onChange={(e) => setEditContestDuration(parseInt(e.target.value))} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date & Time</Label>
                <Input type="datetime-local" value={editStartAt ?? ""} onChange={(e) => setEditStartAt(e.target.value || null)} />
              </div>
              <div className="space-y-2">
                <Label>End Date & Time</Label>
                <Input type="datetime-local" value={editEndAt ?? ""} onChange={(e) => setEditEndAt(e.target.value || null)} />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Questions</h3>

              {editQuestions.map((q, index) => (
                <div key={index} className="border rounded-lg p-4 space-y-4 relative">
                  <div className="absolute top-2 right-2 flex items-center space-x-1">
                    <Button variant="ghost" size="icon" onClick={() => openQuestionEditorForEdit(index)} title="Edit Question">
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleEditRemoveQuestion(index)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2 col-span-2">
                      <Label>Title</Label>
                      <Input value={q.title} onChange={(e) => handleEditQuestionChange(index, "title", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Level</Label>
                      <Select value={q.level?.toString() ?? "1"} onValueChange={(val) => handleEditQuestionChange(index, "level", parseInt(val))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select level" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 - Easy</SelectItem>
                          <SelectItem value="2">2 - Medium</SelectItem>
                          <SelectItem value="3">3 - Hard</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label>Problem Description</Label>
                    <Textarea value={q.description} onChange={(e) => handleEditQuestionChange(index, "description", e.target.value)} />
                  </div>

                  <div>
                    <Label>Constraints</Label>
                    <Textarea value={q.constraints} onChange={(e) => handleEditQuestionChange(index, "constraints", e.target.value)} />
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">Inputs</h4>
                      <Button variant="outline" size="sm" onClick={() => handleEditAddInput(index)}>Add Input</Button>
                    </div>
                    {(q.inputs || []).map((inp, ii) => (
                      <div key={ii} className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end mt-2">
                        <div className="md:col-span-2">
                          <Label>Variable Name</Label>
                          <Input value={inp.name} onChange={(e) => handleEditInputChange(index, ii, "name", e.target.value)} />
                        </div>
                        <div className="md:col-span-2">
                          <Label>Type</Label>
                          <Select value={inp.type} onValueChange={(val) => handleEditInputChange(index, ii, "type", val as any)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="int">int</SelectItem>
                              <SelectItem value="string">string</SelectItem>
                              <SelectItem value="array">array</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="md:col-span-2">
                          <Label>Example Value</Label>
                          <Input value={inp.example} onChange={(e) => handleEditInputChange(index, ii, "example", e.target.value)} />
                        </div>
                        <div className="md:col-span-6 text-right">
                          <Button variant="ghost" size="icon" onClick={() => handleEditRemoveInput(index, ii)}><X className="h-4 w-4" /></Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">Sample Inputs & Outputs</h4>
                      <Button variant="outline" size="sm" onClick={() => handleEditAddSamplePair(index)}>Add Sample IO</Button>
                    </div>
                    {(q.sampleInputs || []).map((si, sidx) => (
                      <div key={sidx} className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                        <div>
                          <Label>Sample Input #{sidx + 1}</Label>
                          <Textarea value={si} onChange={(e) => handleEditSampleInputChange(index, sidx, e.target.value)} />
                        </div>
                        <div>
                          <Label>Sample Output #{sidx + 1}</Label>
                          <Textarea value={(q.sampleOutputs || [])[sidx] || ""} onChange={(e) => handleEditSampleOutputChange(index, sidx, e.target.value)} />
                        </div>
                        <div className="md:col-span-2 text-right">
                          <Button variant="ghost" size="icon" onClick={() => handleEditRemoveSamplePair(index, sidx)}><X className="h-4 w-4" /></Button>
                        </div>
                      </div>
                    ))}
                  </div>

                </div>
              ))}

              <Button variant="outline" onClick={handleEditAddQuestion}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Question
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------- Question Editor Modal ---------------- */}
      <Dialog open={questionEditorOpen} onOpenChange={(open) => { if (!open) closeQuestionEditor(); setQuestionEditorOpen(open); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Question Editor</DialogTitle>
            <DialogDescription>Edit a single question's details, inputs and sample I/O pairs.</DialogDescription>
          </DialogHeader>

          {editorQuestion ? (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 space-y-2">
                  <Label>Title</Label>
                  <Input value={editorQuestion.title} onChange={(e) => handleEditorFieldChange("title", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Level</Label>
                  <Select value={editorQuestion.level?.toString() ?? "1"} onValueChange={(val) => handleEditorFieldChange("level", parseInt(val))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 - Easy</SelectItem>
                      <SelectItem value="2">2 - Medium</SelectItem>
                      <SelectItem value="3">3 - Hard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Problem Description</Label>
                <Textarea value={editorQuestion.description} onChange={(e) => handleEditorFieldChange("description", e.target.value)} />
              </div>

              <div>
                <Label>Constraints</Label>
                <Textarea value={editorQuestion.constraints} onChange={(e) => handleEditorFieldChange("constraints", e.target.value)} />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Inputs</h4>
                  <Button variant="outline" size="sm" onClick={editorAddInput}>Add Input</Button>
                </div>

                {(editorQuestion.inputs || []).map((inp, ii) => (
                  <div key={ii} className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end mt-2">
                    <div className="md:col-span-2">
                      <Label>Variable Name</Label>
                      <Input value={inp.name} onChange={(e) => editorChangeInput(ii, "name", e.target.value)} />
                    </div>
                    <div className="md:col-span-2">
                      <Label>Type</Label>
                      <Select value={inp.type} onValueChange={(val) => editorChangeInput(ii, "type", val as any)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="int">int</SelectItem>
                          <SelectItem value="string">string</SelectItem>
                          <SelectItem value="array">array</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-2">
                      <Label>Example Value</Label>
                      <Input value={inp.example} onChange={(e) => editorChangeInput(ii, "example", e.target.value)} placeholder={inp.type === "array" ? "e.g. 1,2,3" : "e.g. 42 or hello"} />
                    </div>
                    <div className="md:col-span-6 text-right">
                      <Button variant="ghost" size="icon" onClick={() => editorRemoveInput(ii)}><X className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Sample Inputs & Outputs</h4>
                  <Button variant="outline" size="sm" onClick={editorAddSamplePair}>Add Sample IO</Button>
                </div>

                {(editorQuestion.sampleInputs || []).map((si, sidx) => (
                  <div key={sidx} className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                    <div>
                      <Label>Sample Input #{sidx + 1}</Label>
                      <Textarea value={si} onChange={(e) => editorChangeSampleInput(sidx, e.target.value)} />
                    </div>
                    <div>
                      <Label>Sample Output #{sidx + 1}</Label>
                      <Textarea value={(editorQuestion.sampleOutputs || [])[sidx] || ""} onChange={(e) => editorChangeSampleOutput(sidx, e.target.value)} />
                    </div>
                    <div className="md:col-span-2 text-right">
                      <Button variant="ghost" size="icon" onClick={() => editorRemoveSamplePair(sidx)}><X className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-8 text-center">No question loaded.</div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeQuestionEditor}>Cancel</Button>
            <Button onClick={saveEditorChanges}>Save Question</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* --------------------------------------------------------- */}
    </div>
  );
}
