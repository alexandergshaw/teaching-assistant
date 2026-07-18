"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { listAllOutlookMessagesAction } from "../actions";

type MailInboxValue = {
  unreadMail: number;
  refresh: () => void;
};

const MailInboxContext = createContext<MailInboxValue | null>(null);

export function MailInboxProvider({ children }: { children: React.ReactNode }) {
  const [unreadMail, setUnreadMail] = useState(0);

  const refresh = useCallback(() => {
    let cancelled = false;
    (async () => {
      const result = await listAllOutlookMessagesAction();
      if (!cancelled) {
        let total = 0;
        if (!("error" in result)) {
          for (const account of result.accounts) {
            for (const msg of account.messages) {
              if (!msg.isRead) total += 1;
            }
          }
        }
        setUnreadMail(total);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cleanup = refresh();
    return cleanup;
  }, [refresh]);

  return (
    <MailInboxContext.Provider value={{ unreadMail, refresh }}>
      {children}
    </MailInboxContext.Provider>
  );
}

export function useMailInbox(): MailInboxValue {
  return useContext(MailInboxContext) ?? { unreadMail: 0, refresh: () => {} };
}
