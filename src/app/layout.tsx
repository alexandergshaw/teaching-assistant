import type { Metadata } from "next";
import "./globals.css";
import SelectionChatWidget from "./components/SelectionChatWidget";
import AiChatFab from "./components/AiChatFab";
import ContextMenu from "./components/ContextMenu";
import { InstitutionCountsProvider } from "./components/InstitutionCounts";
import { AccessibilityProvider } from "./components/AccessibilityProvider";
import { SupabaseProvider } from "@/context/SupabaseProvider";

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
        <SupabaseProvider>
          <InstitutionCountsProvider>
            <AccessibilityProvider>{children}</AccessibilityProvider>
          </InstitutionCountsProvider>
          <SelectionChatWidget />
          <AiChatFab />
          <ContextMenu />
        </SupabaseProvider>
      </body>
    </html>
  );
}
