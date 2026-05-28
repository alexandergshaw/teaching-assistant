import type { Metadata } from "next";
import "./globals.css";
import SelectionChatWidget from "./components/SelectionChatWidget";

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
      </body>
    </html>
  );
}
