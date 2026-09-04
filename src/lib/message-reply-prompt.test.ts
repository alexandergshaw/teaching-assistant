import { describe, it, expect } from "vitest";
import {
  buildMessageExtractionPrompt,
  buildMessageReplyPrompt,
  parseExtractedMessages,
  ingredientsRenderValue,
  MESSAGE_INGREDIENTS,
  MESSAGE_INGREDIENT_LABELS,
  DEFAULT_MESSAGE_INGREDIENTS,
  MAX_DRAFT_THREAD_CHARS,
  EXTRACT_BATCH_SIZE,
  DRAFT_BATCH_SIZE,
  MAX_POST_CHARS,
  type MessageCompositionSettings,
} from "./message-reply-prompt";

// Per the repo's "source-text tests over-specify" lesson, most assertions
// below pin the FACT and the ORDERING of what the prompt builders produce,
// not exact spelling - EXCEPT the two frozen literal oracles (one extraction
// prompt, one drafting prompt), captured from this file's own implementation
// via a throwaway vitest run (console.log of JSON.stringify(prompt)),
// confirmed by inspection to satisfy every M8/M10 content bullet, then
// pasted here verbatim. A sabotage that reorders a section, drops a bullet,
// or changes the OUTPUT contract's exact key names is caught by these.

const LEGACY_COMPOSITION: MessageCompositionSettings = {
  ingredients: [],
  addressByName: false,
  formality: "balanced",
};

describe("EXTRACT_BATCH_SIZE / DRAFT_BATCH_SIZE / MAX_POST_CHARS re-export", () => {
  it("are the same values the discussion tool enforces (reused, not restated)", () => {
    expect(EXTRACT_BATCH_SIZE).toBe(6);
    expect(DRAFT_BATCH_SIZE).toBe(5);
    expect(MAX_POST_CHARS).toBe(4000);
  });
});

describe("MAX_DRAFT_THREAD_CHARS", () => {
  it("is 2400 (M10)", () => {
    expect(MAX_DRAFT_THREAD_CHARS).toBe(2400);
  });
});

describe("MESSAGE_INGREDIENTS / MESSAGE_INGREDIENT_LABELS / DEFAULT_MESSAGE_INGREDIENTS", () => {
  it("has exactly the five members M10 names, in order", () => {
    expect(MESSAGE_INGREDIENTS).toEqual(["acknowledge", "answer", "next-step", "offer-help", "deadline-reminder"]);
  });

  it("every member has a non-empty, stem-completing label, and the labels match the AC verbatim", () => {
    expect(MESSAGE_INGREDIENT_LABELS.acknowledge).toBe("an acknowledgement of what they asked");
    expect(MESSAGE_INGREDIENT_LABELS.answer).toBe("a direct answer to their question");
    expect(MESSAGE_INGREDIENT_LABELS["next-step"]).toBe("the next step they should take");
    expect(MESSAGE_INGREDIENT_LABELS["offer-help"]).toBe("an offer to help further");
    expect(MESSAGE_INGREDIENT_LABELS["deadline-reminder"]).toBe("a reminder of the deadline, only if one applies");
  });

  it("defaults to acknowledge/answer/next-step (M10's stated default selection)", () => {
    expect(DEFAULT_MESSAGE_INGREDIENTS).toEqual(["acknowledge", "answer", "next-step"]);
  });
});

describe("ingredientsRenderValue (copied from discussion-reply-controls.ts, re-typed)", () => {
  it("zero selected reads as a real phrase, not a blank box", () => {
    expect(ingredientsRenderValue([])).toBe("Nothing in particular");
  });

  it("joins selected labels with a comma", () => {
    expect(ingredientsRenderValue(["acknowledge", "answer"])).toBe(
      "an acknowledgement of what they asked, a direct answer to their question"
    );
  });
});

describe("buildMessageExtractionPrompt", () => {
  it("states the frame count somewhere in the prompt, and differs when the count differs", () => {
    const promptA = buildMessageExtractionPrompt("", 3);
    const promptB = buildMessageExtractionPrompt("", 6);
    expect(promptA).toContain("3");
    expect(promptB).toContain("6");
    expect(promptA).not.toBe(promptB);
  });

  it("includes the course name, quoted, when given, and omits it entirely when empty", () => {
    const withCourse = buildMessageExtractionPrompt("Intro to Robotics", 5);
    const withoutCourse = buildMessageExtractionPrompt("", 5);
    expect(withCourse).toContain('"Intro to Robotics"');
    expect(withoutCourse).not.toContain("Robotics");
    expect(withoutCourse).not.toMatch(/\n\n\n/);
  });

  it("trims a whitespace-only course name down to the empty-course case", () => {
    expect(buildMessageExtractionPrompt("   ", 5)).toBe(buildMessageExtractionPrompt("", 5));
  });

  it("mentions THE TWO PANES and the exact pane values list/thread", () => {
    const prompt = buildMessageExtractionPrompt("", 5);
    expect(prompt).toContain("THE TWO PANES");
    expect(prompt).toContain('"list"');
    expect(prompt).toContain('"thread"');
  });

  it("mentions the JSON output keys subject/sender/sentAt/text/pane (M8's schema)", () => {
    const prompt = buildMessageExtractionPrompt("", 5);
    for (const key of ["subject", "sender", "sentAt", "text", "pane"]) {
      expect(prompt).toContain(key);
    }
  });

  it("instructs against code fences/backticks", () => {
    expect(buildMessageExtractionPrompt("", 5).toLowerCase()).toContain("backtick");
  });

  it("states the empty-result case returns []", () => {
    expect(buildMessageExtractionPrompt("", 5)).toContain("[]");
  });

  it("tells the model never to guess whether a message is the instructor's own", () => {
    expect(buildMessageExtractionPrompt("", 5).toLowerCase()).toContain("do not guess whether a message is yours");
  });

  it("frozen literal oracle - the exact extraction prompt for a representative call", () => {
    const prompt = buildMessageExtractionPrompt("Intro to Robotics", 5);
    expect(prompt).toBe(
      "The 5 images are consecutive screenshots of an online course messaging inbox, captured about a second apart while the reader scrolled the list or read through open conversations.\n\nThe inbox belongs to a course called \"Intro to Robotics\".\n\nRead the messages exchanged with students and return them.\n\nHOW THE IMAGES RELATE TO EACH OTHER\n\n- The images overlap heavily. The same message will usually appear in several of them, in a different vertical position each time. That is one message, not several. Return it ONCE.\n\n- When a message appears in more than one image, use the reading in which the MOST of its text is visible.\n\n- When the top of a message is visible in one image and the bottom in another, join the two halves into one message and return the joined text.\n\n- Read the images in the order given; they run top to bottom down one page, or in the order the conversations were opened.\n\nTHE TWO PANES\n\n- A conversation LIST pane shows one row per conversation: a subject, the participants, and a short one-line preview of the latest message. No more of the message body than that preview is visible there.\n\n- An open conversation's THREAD pane shows the full dated message bodies exchanged in that one conversation.\n\n- Report which pane a reading came from in \"pane\", exactly \"list\" for a list-pane row or exactly \"thread\" for an open conversation.\n\nWHAT COUNTS AS A MESSAGE\n\n- In the THREAD pane, a message is one dated body from one sender. Return each one as its own entry.\n\n- In the LIST pane, a row's one-line preview counts as a single entry - do not split it into more than one message and do not invent the rest of a body that is not shown.\n\n- Ignore everything that is page furniture rather than a message: navigation bars and menus, course sidebars, breadcrumbs, buttons and links such as Reply, Forward, Archive, Delete, Compose, Search, Filter, Mark as read; unread counters; avatars and profile pictures.\n\nSUBJECT\n\n- Every entry belongs to one conversation. Report that conversation's subject in \"subject\", exactly as shown, repeated on every entry that belongs to it.\n\n- When no subject is visible for a conversation, leave \"subject\" as an empty string rather than inventing one.\n\nSENDER\n\n- In the THREAD pane, report the name shown next to each message, exactly as it is displayed, in \"sender\". The inbox never marks which messages are your own with a \"you\" label or similar - report only the name that is actually printed, and do not guess whether a message is yours or the student's.\n\n- In the LIST pane, report the other participant's name that row is filed under in \"sender\" - the name the list shows for that conversation, not a guess at who wrote the preview text if that is not separately shown.\n\nTIMESTAMPS\n\n- Report the message's timestamp, exactly as it is shown on screen, in \"sentAt\" - for example \"Sep 3 at 2:14pm\", \"Yesterday\", or a bare time.\n\n- If no timestamp is visible for a message, leave \"sentAt\" out of that entry entirely.\n\nTEXT THAT IS CUT OFF\n\n- If a message is truncated by a control such as \"Show more\" or an ellipsis, return only the text that is actually visible, and do NOT include the control's own words in the text.\n\n- If a message runs off the bottom edge of the last image, return the visible part.\n\n- A message that quotes an earlier message beneath a reply (a line starting with \">\", or \"On ... wrote:\") is part of that message's own text - include it exactly as shown, do not strip it out yourself.\n\n- Never continue, complete, summarise, paraphrase, correct or tidy a message. Transcribe the words that are on the screen. If you cannot read a word, leave it out rather than inventing one.\n\nIF THERE ARE NO MESSAGES\n\n- If these images show only navigation, an empty inbox or a loading state, return an empty array: []\n\n- A frame showing only the list pane, with no conversation open, still yields \"list\" entries for whatever rows are visible - it is not empty just because no thread is open.\n\nOUTPUT\n\nReturn ONLY a JSON array, and nothing else. Each element is {\"subject\": \"...\", \"sender\": \"...\", \"sentAt\": \"...\", \"text\": \"...\", \"pane\": \"...\"} - no other keys.\n\n\"subject\" is the conversation's subject line, exactly as shown, or \"\" when none is visible.\n\n\"sender\" is the display name exactly as it is shown, with no title, no timestamp and no role label.\n\n\"text\" is the message's words as plain text. Use \"\\n\" between paragraphs. Do not use markdown and do not use backticks.\n\n\"sentAt\" is omitted entirely when no timestamp is visible.\n\n\"pane\" is exactly \"list\" or \"thread\", per THE TWO PANES rules above.\n\nOrder the array the way the messages appear on the page, top to bottom.\n\nNo prose before or after the array. No code fences."
    );
  });
});

describe("parseExtractedMessages", () => {
  it("accepts a well-formed array, keeping fields verbatim (trimmed)", () => {
    const messages = parseExtractedMessages([
      { subject: " Question about HW3 ", sender: " Devon Alvarez ", text: " Can you clarify part 2? ", sentAt: "Sep 3 at 2:14pm", pane: "thread" },
    ]);
    expect(messages).toEqual([
      { subject: "Question about HW3", sender: "Devon Alvarez", text: "Can you clarify part 2?", sentAt: "Sep 3 at 2:14pm", pane: "thread" },
    ]);
  });

  it("drops an entry with an empty or missing sender", () => {
    expect(parseExtractedMessages([{ subject: "X", sender: "", text: "hello", pane: "thread" }])).toEqual([]);
    expect(parseExtractedMessages([{ subject: "X", text: "hello", pane: "thread" }])).toEqual([]);
  });

  it("drops an entry with an empty or missing text", () => {
    expect(parseExtractedMessages([{ subject: "X", sender: "Devon", text: "", pane: "thread" }])).toEqual([]);
    expect(parseExtractedMessages([{ subject: "X", sender: "Devon", pane: "thread" }])).toEqual([]);
  });

  it("defaults subject to '' when missing - never invents one, and this survives a literal '(no subject)' reading unchanged", () => {
    const [a] = parseExtractedMessages([{ sender: "Devon", text: "hi", pane: "thread" }]);
    expect(a.subject).toBe("");
    const [b] = parseExtractedMessages([{ subject: "(no subject)", sender: "Devon", text: "hi", pane: "thread" }]);
    expect(b.subject).toBe("(no subject)");
  });

  it("omits sentAt entirely when absent or blank", () => {
    const [a] = parseExtractedMessages([{ subject: "X", sender: "Devon", text: "hi", pane: "thread" }]);
    expect(a.sentAt).toBeUndefined();
    const [b] = parseExtractedMessages([{ subject: "X", sender: "Devon", text: "hi", sentAt: "   ", pane: "thread" }]);
    expect(b.sentAt).toBeUndefined();
  });

  it("coerces an unrecognised pane to 'thread'", () => {
    const [a] = parseExtractedMessages([{ subject: "X", sender: "Devon", text: "hi", pane: "bogus" }]);
    expect(a.pane).toBe("thread");
    const [b] = parseExtractedMessages([{ subject: "X", sender: "Devon", text: "hi" }]);
    expect(b.pane).toBe("thread");
  });

  it("keeps a 'list' pane reading as 'list', case-sensitively (only the exact literal survives)", () => {
    const [a] = parseExtractedMessages([{ subject: "X", sender: "Devon", text: "preview text", pane: "list" }]);
    expect(a.pane).toBe("list");
    const [b] = parseExtractedMessages([{ subject: "X", sender: "Devon", text: "preview text", pane: "List" }]);
    expect(b.pane).toBe("thread");
  });

  it("truncates text over MAX_POST_CHARS with a visible marker", () => {
    const long = "a".repeat(MAX_POST_CHARS + 50);
    const [a] = parseExtractedMessages([{ subject: "X", sender: "Devon", text: long, pane: "thread" }]);
    expect(a.text.length).toBe(MAX_POST_CHARS + 3);
    expect(a.text.endsWith("...")).toBe(true);
  });

  it("preserves a quoted-reply body verbatim (quote-stripping is message-thread.ts's concern, not extraction's)", () => {
    const quoted = "Thanks!\n\nOn Sep 2, Devon wrote:\n> original question here";
    const [a] = parseExtractedMessages([{ subject: "X", sender: "Devon", text: quoted, pane: "thread" }]);
    expect(a.text).toBe(quoted);
  });

  it("returns [] for a non-array and skips non-object entries", () => {
    expect(parseExtractedMessages(null)).toEqual([]);
    expect(parseExtractedMessages("not an array")).toEqual([]);
    expect(parseExtractedMessages([null, 42, "x", { subject: "X", sender: "Devon", text: "hi", pane: "thread" }])).toHaveLength(1);
  });
});

describe("buildMessageReplyPrompt", () => {
  const threads = [
    { messages: [{ text: "First thread's latest message.", fromMe: false }] },
    { messages: [{ text: "Second thread's latest message.", fromMe: false }] },
  ];

  it("includes every thread's message text, in order, numbered THREAD 1..N", () => {
    const prompt = buildMessageReplyPrompt(threads, "", "", LEGACY_COMPOSITION);
    const idx1 = prompt.indexOf("THREAD 1");
    const idx1Text = prompt.indexOf("First thread's latest message.");
    const idx2 = prompt.indexOf("THREAD 2");
    const idx2Text = prompt.indexOf("Second thread's latest message.");
    expect(idx1).toBeGreaterThanOrEqual(0);
    expect(idx2).toBeGreaterThan(idx1);
    expect(idx1Text).toBeGreaterThan(idx1);
    expect(idx1Text).toBeLessThan(idx2);
    expect(idx2Text).toBeGreaterThan(idx2);
  });

  it("states the exact reply count expected back, matching threads.length", () => {
    const prompt2 = buildMessageReplyPrompt(threads, "", "", LEGACY_COMPOSITION);
    const prompt1 = buildMessageReplyPrompt(threads.slice(0, 1), "", "", LEGACY_COMPOSITION);
    expect(prompt2).toContain("2");
    expect(prompt1).not.toBe(prompt2);
  });

  it("keeps the discussion tool's output key 'post' verbatim, never 'thread'", () => {
    const prompt = buildMessageReplyPrompt(threads, "", "", LEGACY_COMPOSITION);
    expect(prompt).toContain('{"post"');
    expect(prompt).not.toContain('{"thread"');
  });

  it("puts styleBlock LAST", () => {
    const styleBlock = "MATCH THE INSTRUCTOR'S PERSONAL WRITING STYLE:\nSome sample text.";
    const prompt = buildMessageReplyPrompt(threads, "", styleBlock, LEGACY_COMPOSITION);
    expect(prompt.trim().endsWith(styleBlock.trim())).toBe(true);
  });

  it("omits the style block entirely when empty", () => {
    const withStyle = buildMessageReplyPrompt(threads, "", "non-empty style", LEGACY_COMPOSITION);
    const withoutStyle = buildMessageReplyPrompt(threads, "", "", LEGACY_COMPOSITION);
    expect(withoutStyle).not.toContain("non-empty style");
    expect(withStyle.length).toBeGreaterThan(withoutStyle.length);
  });

  it("includes the course name, quoted, when given, and omits it entirely when empty", () => {
    const withCourse = buildMessageReplyPrompt(threads, "Intro to Robotics", "", LEGACY_COMPOSITION);
    const withoutCourse = buildMessageReplyPrompt(threads, "", "", LEGACY_COMPOSITION);
    expect(withCourse).toContain('"Intro to Robotics"');
    expect(withoutCourse).not.toContain("Robotics");
  });

  it("uses one fixed audience stance line - no audience parameter exists", () => {
    const prompt = buildMessageReplyPrompt(threads, "", "", LEGACY_COMPOSITION);
    expect(prompt).toContain("privately to one student who wrote to you");
  });

  it("tells the model never to write a closing signature/sign-off/name, unconditionally (M11: applySignoff appends it in code)", () => {
    const prompt = buildMessageReplyPrompt(threads, "", "", LEGACY_COMPOSITION);
    expect(prompt).toContain("Do not write a closing signature, sign-off or your name.");
  });

  it("instructs answering the LATEST student message in each thread", () => {
    const prompt = buildMessageReplyPrompt(threads, "", "", LEGACY_COMPOSITION).toLowerCase();
    expect(prompt).toContain("latest message from the student");
  });

  it("labels messages [student] and [you] by role, never by name", () => {
    const withFromMe = [{ messages: [{ text: "Question here.", fromMe: false }, { text: "My answer.", fromMe: true }] }];
    const prompt = buildMessageReplyPrompt(withFromMe, "", "", LEGACY_COMPOSITION);
    expect(prompt).toContain("[student] Question here.");
    expect(prompt).toContain("[you] My answer.");
  });

  describe("ingredients block", () => {
    it("zero ingredients selected omits the block entirely", () => {
      const prompt = buildMessageReplyPrompt(threads, "", "", LEGACY_COMPOSITION);
      expect(prompt).not.toContain("EACH REPLY SHOULD INCLUDE");
    });

    it("at least one ingredient selected emits the block", () => {
      const prompt = buildMessageReplyPrompt(threads, "", "", { ...LEGACY_COMPOSITION, ingredients: ["answer"] });
      expect(prompt).toContain("EACH REPLY SHOULD INCLUDE");
    });

    it("the deadline-reminder clause is explicitly conditional", () => {
      const prompt = buildMessageReplyPrompt(threads, "", "", {
        ...LEGACY_COMPOSITION,
        ingredients: ["deadline-reminder"],
      }).toLowerCase();
      expect(prompt).toContain("only if");
      expect(prompt).toContain("say nothing");
    });
  });

  describe("address-by-name toggle", () => {
    const withGreeting = [{ ...threads[0], greetingName: "Devon" }, threads[1]];

    it("toggle ON opens with the given greeting name and drops the 'do not open with the student's name' clause", () => {
      const prompt = buildMessageReplyPrompt(withGreeting, "", "", { ...LEGACY_COMPOSITION, addressByName: true });
      expect(prompt).not.toContain("Do not open with the student's name");
      expect(prompt).toContain("Devon");
    });

    it("a thread with no greetingName gets no greeting instruction even when the toggle is ON", () => {
      const prompt = buildMessageReplyPrompt(threads, "", "", { ...LEGACY_COMPOSITION, addressByName: true });
      expect(prompt).not.toContain("GREETING NAMES");
      expect(prompt.toLowerCase()).toContain("no greeting");
    });
  });

  describe("formality", () => {
    it("the balanced stop contributes no clause text at all - the audience line is immediately followed by the next real line, with no formality phrasing anywhere", () => {
      const balanced = buildMessageReplyPrompt(threads, "", "", { ...LEGACY_COMPOSITION, formality: "balanced" });
      expect(balanced).not.toContain("Lean casual");
      expect(balanced).not.toContain("Lean formal");
      expect(balanced.startsWith(
        "You are the instructor replying privately to one student who wrote to you.\n\nWrite one reply to each thread below"
      )).toBe(true);
    });

    it("each of the three formality stops produces a materially different prompt", () => {
      const casual = buildMessageReplyPrompt(threads, "", "", { ...LEGACY_COMPOSITION, formality: "casual" });
      const balanced = buildMessageReplyPrompt(threads, "", "", { ...LEGACY_COMPOSITION, formality: "balanced" });
      const formal = buildMessageReplyPrompt(threads, "", "", { ...LEGACY_COMPOSITION, formality: "formal" });
      expect(casual).not.toBe(balanced);
      expect(formal).not.toBe(balanced);
      expect(casual).not.toBe(formal);
    });
  });

  describe("MAX_DRAFT_THREAD_CHARS trimming", () => {
    it("the latest incoming message is never truncated or dropped, even in an over-budget thread", () => {
      const latest = "X".repeat(MAX_DRAFT_THREAD_CHARS + 500);
      const overBudget = [
        {
          messages: [
            { text: "An earlier message.", fromMe: false },
            { text: "An earlier reply.", fromMe: true },
            { text: latest, fromMe: false },
          ],
        },
      ];
      const prompt = buildMessageReplyPrompt(overBudget, "", "", LEGACY_COMPOSITION);
      expect(prompt).toContain(latest);
    });

    it("drops older messages whole, oldest first, replaced by one omission line, once the thread exceeds the budget", () => {
      const filler = "word ".repeat(200); // ~1000 chars per message
      const overBudget = [
        {
          messages: [
            { text: `oldest ${filler}`, fromMe: false },
            { text: `middle ${filler}`, fromMe: true },
            { text: `newer ${filler}`, fromMe: false },
            { text: "latest incoming, short.", fromMe: false },
          ],
        },
      ];
      const prompt = buildMessageReplyPrompt(overBudget, "", "", LEGACY_COMPOSITION);
      expect(prompt).not.toContain("oldest word");
      // Exactly ONE message dropped, not more: at ~1005 chars each, dropping
      // only the oldest already brings the thread (middle + newer + latest)
      // under MAX_DRAFT_THREAD_CHARS, so "middle" and "newer" must both
      // still be rendered whole - a test that only checked "oldest" is gone
      // would pass even if the trimmer over-dropped.
      expect(prompt).toContain("middle word");
      expect(prompt).toContain("newer word");
      expect(prompt).toContain("[... 1 earlier messages omitted]");
      expect(prompt).toContain("latest incoming, short.");
    });

    it("a thread within budget renders every message with no omission line", () => {
      const prompt = buildMessageReplyPrompt(threads, "", "", LEGACY_COMPOSITION);
      expect(prompt).not.toMatch(/earlier messages omitted/);
    });
  });

  describe("knowledgeContext", () => {
    it("survives into the prompt verbatim, before styleBlock", () => {
      const styleBlock = "MATCH THE STYLE:\nSample.";
      const prompt = buildMessageReplyPrompt(threads, "", styleBlock, LEGACY_COMPOSITION, "Selected page: Policy\nSome policy text.");
      expect(prompt).toContain("Selected page: Policy");
      expect(prompt.indexOf("Selected page: Policy")).toBeLessThan(prompt.indexOf(styleBlock));
    });

    it("omitting knowledgeContext leaves the prompt identical to explicit undefined and to empty string", () => {
      const omitted = buildMessageReplyPrompt(threads, "", "", LEGACY_COMPOSITION);
      const explicitUndefined = buildMessageReplyPrompt(threads, "", "", LEGACY_COMPOSITION, undefined);
      const empty = buildMessageReplyPrompt(threads, "", "", LEGACY_COMPOSITION, "");
      expect(omitted).toBe(explicitUndefined);
      expect(omitted).toBe(empty);
    });
  });

  it("frozen literal oracle - the exact drafting prompt for a representative two-thread call", () => {
    const threadsFixture = [
      {
        messages: [
          { text: "Hi, I am confused about the homework.", fromMe: false },
          { text: "Which part is confusing?", fromMe: true },
          { text: "The part about recursion.", fromMe: false },
        ],
        greetingName: "Devon",
      },
      { messages: [{ text: "When is the exam?", fromMe: false }] },
    ];
    const prompt = buildMessageReplyPrompt(threadsFixture, "Intro to Robotics", "", LEGACY_COMPOSITION);
    expect(prompt).toBe(
      "You are the instructor replying privately to one student who wrote to you.\n\nThe conversation is part of a course called \"Intro to Robotics\".\n\nWrite one reply to each thread below, answering that thread's latest message from the student.\n\nEVERY REPLY\n\n- Write in the first person, as yourself.\n\n- 3 to 6 sentences. Plain prose.\n\n- No markdown, no headings, no bullet lists, no bold.\n\n- No greeting line. Do not open with the student's name. The reply is pasted into a box that already shows who is speaking and who is being answered.\n\n- No emoji.\n\n- Do not write a closing signature, sign-off or your name.\n\n- Never state a fact about the course - a date, a policy, a reading, an assignment, a grade - that is not written in the thread shown to you here. If you need one, write around it.\n\n- Answer the LATEST message from the student in that thread. Do not refer to the other threads below.\n\nTHE THREADS\n\nTHREAD 1\n[student] Hi, I am confused about the homework.\n[you] Which part is confusing?\n[student] The part about recursion.\n\n---\n\nTHREAD 2\n[student] When is the exam?\n\nOUTPUT\n\nReturn ONLY a JSON array with exactly 2 elements, and nothing else.\n\nEach element is {\"post\": <the THREAD number>, \"reply\": \"...\"} - the number, not the name.\n\nInclude every thread number from 1 to 2, in order.\n\nWrite the reply as plain text. If it runs longer than about 60 words, break it into at least two paragraphs, separated by a blank line (\"\\n\\n\"). No backticks.\n\nNo prose before or after the array. No code fences."
    );
  });
});
