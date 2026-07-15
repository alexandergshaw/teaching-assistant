import type { Metadata } from "next";
import "./globals.css";
import SelectionChatWidget from "./components/SelectionChatWidget";
import AiChatFab from "./components/AiChatFab";
import ContextMenu from "./components/ContextMenu";
import { InstitutionCountsProvider } from "./components/InstitutionCounts";
import { VcCountsProvider } from "./components/VcCounts";
import { FilesInboxProvider } from "./components/FilesInbox";
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
  const themeBootstrap = `(function(){try{var t=localStorage.getItem("ta-theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme="light";}})();`;

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <AppThemeProvider>
          <SupabaseProvider>
            <InstitutionCountsProvider>
              <VcCountsProvider>
                <FilesInboxProvider>
                  <AccessibilityProvider>{children}</AccessibilityProvider>
                </FilesInboxProvider>
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
