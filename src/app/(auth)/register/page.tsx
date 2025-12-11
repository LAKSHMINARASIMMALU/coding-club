"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { createUserWithEmailAndPassword } from "firebase/auth";
<<<<<<< HEAD
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
=======
import { doc, setDoc } from "firebase/firestore";
>>>>>>> d517b11 (Initial local commit)
import { auth, db } from "@/lib/firebase";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Code2 } from "lucide-react";
import { useRouter } from "next/navigation";

const departments = ["CSE", "ECE", "AI&DS", "EEE", "MECH", "CIVIL"];

<<<<<<< HEAD
=======
/**
 * Schema: regNo must be at least 5 characters AND start with "4207".
 */
>>>>>>> d517b11 (Initial local commit)
const formSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  regNo: z
    .string()
    .min(5, { message: "Registration number is required." })
    .regex(/^4207/, { message: "Registration number must start with 4207." }),
  department: z.string({ required_error: "Please select a department." }),
  email: z.string().email({ message: "Invalid email address." }),
  password: z.string().min(6, { message: "Password must be at least 6 characters." }),
});

export default function RegisterPage() {
  const { toast } = useToast();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      regNo: "",
      email: "",
      password: "",
<<<<<<< HEAD
      department: departments[0],
=======
      department: departments[0], // set sensible default to avoid uncontrolled warnings
>>>>>>> d517b11 (Initial local commit)
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    try {
<<<<<<< HEAD
      // 1) Create authenticated user
      const userCredential = await createUserWithEmailAndPassword(auth, values.email, values.password);
      const user = userCredential.user;
      console.log("Auth created uid=", user.uid);

      // 2) Force ID token refresh (useful if you use custom claims)
      await user.getIdToken(true);

      // 3) Prepare user doc and write to Firestore
      const userRef = doc(db, "users", user.uid);
      const userData = {
        userId: user.uid,
=======
      const userCredential = await createUserWithEmailAndPassword(auth, values.email, values.password);
      const user = userCredential.user;

      // Store additional user info in Firestore
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
>>>>>>> d517b11 (Initial local commit)
        name: values.name,
        regNo: values.regNo,
        department: values.department,
        email: values.email,
<<<<<<< HEAD
        role: "user",
        createdAt: serverTimestamp(),
      };

      await setDoc(userRef, userData);
      console.log("Firestore user document created:", userRef.path);
=======
        role: "user", // Default role
      });
>>>>>>> d517b11 (Initial local commit)

      toast({
        title: "Registration Successful",
        description: "Your account has been created. Redirecting...",
      });
<<<<<<< HEAD

      // redirect to dashboard (adjust path as needed)
      router.push("/dashboard");
    } catch (err: any) {
      console.error("Registration error full:", err);

      // If permissions error, show helpful message
      if (err?.code === "permission-denied" || (err?.message && err.message.toLowerCase().includes("permission"))) {
        toast({
          variant: "destructive",
          title: "Registration Failed",
          description: "Missing or insufficient permissions. Check Firestore rules & projectId.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Registration Failed",
          description: err?.message || "An unknown error occurred.",
        });
      }
=======
      router.push('/dashboard');
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Registration Failed",
        description: error?.message || "An unknown error occurred.",
      });
>>>>>>> d517b11 (Initial local commit)
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md shadow-2xl">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex items-center justify-center w-16 h-16 rounded-full bg-primary text-primary-foreground">
<<<<<<< HEAD
          <Code2 className="w-8 h-8" />
=======
            <Code2 className="w-8 h-8" />
>>>>>>> d517b11 (Initial local commit)
        </div>
        <CardTitle className="text-3xl font-headline">Create an Account</CardTitle>
        <CardDescription>Join CodeContest Arena today!</CardDescription>
      </CardHeader>
<<<<<<< HEAD

=======
>>>>>>> d517b11 (Initial local commit)
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input placeholder="John Doe" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
<<<<<<< HEAD

=======
>>>>>>> d517b11 (Initial local commit)
            <FormField
              control={form.control}
              name="regNo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Registration Number</FormLabel>
                  <FormControl>
                    <Input placeholder="4207xxxx" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
<<<<<<< HEAD

=======
>>>>>>> d517b11 (Initial local commit)
            <FormField
              control={form.control}
              name="department"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Department</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select your department" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {departments.map((dept) => (
                        <SelectItem key={dept} value={dept}>
                          {dept}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
<<<<<<< HEAD

=======
>>>>>>> d517b11 (Initial local commit)
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input placeholder="name@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
<<<<<<< HEAD

=======
>>>>>>> d517b11 (Initial local commit)
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
<<<<<<< HEAD

=======
>>>>>>> d517b11 (Initial local commit)
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Account
            </Button>
          </form>
        </Form>
<<<<<<< HEAD

=======
>>>>>>> d517b11 (Initial local commit)
        <div className="mt-6 text-center text-sm">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
