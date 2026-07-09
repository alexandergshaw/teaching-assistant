import type { Metadata } from "next";
import "./globals.css";
import SelectionChatWidget from "./components/SelectionChatWidget";
import AiChatFab from "./components/AiChatFab";
import ContextMenu from "./components/ContextMenu";
import { InstitutionCountsProvider } from "./components/InstitutionCounts";
import { VcCountsProvider } from "./components/VcCounts";
import { AccessibilityProvider } from "./components/AccessibilityProvider";
import { SupabaseProvider } from "@/context/SupabaseProvider";
import AppThemeProvider from "./components/AppThemeProvider";

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
        <AppThemeProvider>
          <SupabaseProvider>
            <InstitutionCountsProvider>
              <VcCountsProvider>
                <AccessibilityProvider>{children}</AccessibilityProvider>
              </VcCountsProvider>
            </InstitutionCountsProvider>
            <SelectionChatWidget />
            <AiChatFab />
            <ContextMenu />
          </SupabaseProvider>
        </AppThemeProvider>
      </body>
    </html>
  );
}
