# **App Name**: CodeContest Arena

## Core Features:

- User Authentication: Secure user registration and login using Firebase Authentication, supporting different departments.
- Admin Dashboard: Admin interface to manage contests, view leaderboards, and manage users.
- Contest Management: Create, edit, and delete contests with multiple levels, questions, time limits, and problem details stored in Firestore.
- Question Panel & Code Editor: User interface for contest participants to view questions, use a code editor with compilation and execution capabilities.
- Automated Code Evaluation: Compile and run user-submitted code against sample inputs, comparing the output to expected outputs to determine the correctness and award scores.
- Leaderboard: Display real-time leaderboard based on user scores fetched from Firestore and shown both in the admin and user dashboards.
- Tab Switch Detection: Implement a feature to detect tab switching during a contest, which leads to immediate contest termination.

## Style Guidelines:

- Primary color: Deep purple (#673AB7) to convey sophistication and challenge.
- Background color: Light grey (#F5F5F5) for a clean and focused environment.
- Accent color: Cyan (#00BCD4) to highlight interactive elements.
- Body and headline font: 'Inter' for a modern and readable interface.
- Code font: 'Source Code Pro' for the code editor to improve readability.
- Use a set of consistent icons from a library like FontAwesome or Material Icons for key actions and navigation.
- A clean, well-organized layout using a grid system to ensure responsiveness and readability on different screen sizes.