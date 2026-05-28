import type { Metadata } from "next";
import "./globals.css";
import SelectionChatWidget from "./components/SelectionChatWidget";
import AiChatFab from "./components/AiChatFab";

export const metadata: Metadata = {
  title: "Teaching Assistant",
  description: "Upload student submissions, assignment instructions, and a rubric.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <SelectionChatWidget />
        <AiChatFab />
      </body>
    </html>
  );
}
