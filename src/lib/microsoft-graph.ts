// Microsoft Graph API calls for Outlook mailbox operations. Server-only.
// Raw fetch to match the rest of the codebase; no SDK. All functions throw on failure.

interface MessageData {
  id: string;
  subject: string;
  from: {
    emailAddress: {
      address: string;
      name: string;
    };
  };
  receivedDateTime: string;
  isRead?: boolean;
  webLink?: string;
  bodyPreview?: string;
}

export interface Message {
  id: string;
  subject: string;
  fromAddress: string;
  fromName: string;
  receivedDateTime: string;
  isRead: boolean;
  webLink: string;
  bodyPreview: string;
}

/**
 * Fetch recent messages from the connected Outlook inbox. Throws on network or
 * permission failure. A 403 does not throw MAIL_SEND_NOT_GRANTED here.
 */
export async function listRecentMessages(
  accessToken: string,
  opts?: { top?: number; sinceIso?: string }
): Promise<Message[]> {
  const top = Math.min(opts?.top ?? 10, 50);
  const params = new URLSearchParams({
    $select: "id,subject,from,receivedDateTime,isRead,webLink,bodyPreview",
    $orderby: "receivedDateTime desc",
    $top: String(top),
  });

  if (opts?.sinceIso) {
    params.append("$filter", `receivedDateTime ge ${opts.sinceIso}`);
  }

  const url = `https://graph.microsoft.com/v1.0/me/messages?${params.toString()}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `Microsoft Graph request failed: ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`
      );
    }

    const data = (await response.json()) as {
      value?: MessageData[];
    };

    return (data.value ?? []).map((msg) => ({
      id: msg.id,
      subject: msg.subject,
      fromAddress: msg.from?.emailAddress?.address ?? "",
      fromName: msg.from?.emailAddress?.name ?? "",
      receivedDateTime: msg.receivedDateTime,
      isRead: msg.isRead !== false,
      webLink: msg.webLink ?? "",
      bodyPreview: msg.bodyPreview ?? "",
    }));
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Send an email message via Outlook. Throws on failure. A 403 throws
 * MAIL_SEND_NOT_GRANTED to signal the scope was not granted.
 */
export async function sendMail(
  accessToken: string,
  opts: {
    to: string[];
    bcc?: string[];
    subject: string;
    body: string;
  }
): Promise<void> {
  const toRecipients = opts.to.map((address) => ({
    emailAddress: { address },
  }));

  const bccRecipients = (opts.bcc ?? []).map((address) => ({
    emailAddress: { address },
  }));

  const url = "https://graph.microsoft.com/v1.0/me/sendMail";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject: opts.subject,
        body: {
          contentType: "Text",
          content: opts.body,
        },
        toRecipients,
        bccRecipients,
      },
      saveToSentItems: true,
    }),
  });

  if (response.status === 403) {
    throw new Error("MAIL_SEND_NOT_GRANTED");
  }

  if (response.status !== 202) {
    throw new Error(
      `Microsoft Graph sendMail failed: ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`
    );
  }
}

/**
 * Mark a message as read or unread. Throws on failure. A 403 throws
 * MAIL_READWRITE_NOT_GRANTED to signal the scope was not granted.
 */
export async function markMessageRead(
  accessToken: string,
  messageId: string,
  isRead: boolean
): Promise<void> {
  const url = `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}`;

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      isRead,
    }),
  });

  if (response.status === 403) {
    throw new Error("MAIL_READWRITE_NOT_GRANTED");
  }

  if (!response.ok) {
    throw new Error(
      `Microsoft Graph markMessageRead failed: ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`
    );
  }
}
