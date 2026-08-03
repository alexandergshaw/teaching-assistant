import { describe, it, expect } from "vitest";
import {
  isPlaceholderTopic,
  isFileManifestSummary,
  summaryNamesGeneratedFile,
} from "./schedule-topic-quality";

describe("isPlaceholderTopic", () => {
  describe("placeholder shapes it must catch", () => {
    it("catches the exact real-run duplicate-label shape", () => {
      expect(isPlaceholderTopic("Module 08: Module 08")).toBe(true);
    });

    it("catches a bare structural label with no colon", () => {
      expect(isPlaceholderTopic("Module 08")).toBe(true);
      expect(isPlaceholderTopic("Week 3")).toBe(true);
      expect(isPlaceholderTopic("Unit 5")).toBe(true);
    });

    it("catches the duplicate-label shape with odd spacing and casing", () => {
      expect(isPlaceholderTopic("  MODULE   08 :  module    08  ")).toBe(true);
      expect(isPlaceholderTopic("module08:Module08")).toBe(true);
      expect(isPlaceholderTopic("WEEK 3: week 03")).toBe(true);
    });

    it("catches an empty or whitespace-only topic", () => {
      expect(isPlaceholderTopic("")).toBe(true);
      expect(isPlaceholderTopic("   ")).toBe(true);
      expect(isPlaceholderTopic("\n\t ")).toBe(true);
    });

    it("catches the week-1 'Start Here; Module 01: Module 01' shape from the real run", () => {
      expect(isPlaceholderTopic("Start Here; Module 01: Module 01")).toBe(true);
    });

    it("catches a label followed by another bare label", () => {
      expect(isPlaceholderTopic("Module 08: Week 08")).toBe(true);
    });

    it("catches a label followed by pure course furniture", () => {
      expect(isPlaceholderTopic("Module 01: Start Here")).toBe(true);
    });

    it("catches a label with a trailing empty separator", () => {
      expect(isPlaceholderTopic("Module 08:")).toBe(true);
      expect(isPlaceholderTopic("Module 08 -")).toBe(true);
    });

    it("catches bare course furniture alone", () => {
      expect(isPlaceholderTopic("Start Here")).toBe(true);
      expect(isPlaceholderTopic("Welcome")).toBe(true);
    });

    it("catches every joined segment being a placeholder, using the dash separator too", () => {
      expect(isPlaceholderTopic("Module 08 - Module 08")).toBe(true);
    });

    // DEPTH-INDEPENDENCE: the accumulating tile-export feedback loop (see
    // this module's own header comment) adds ONE MORE "Module NN: " layer
    // per Course Build run, not a fixed number - a real instructor's course
    // tile has already been observed at three stacked levels. The detector
    // must keep catching the duplicate-label shape no matter how many layers
    // are stacked, not just the first one.
    describe("depth-independence - the duplicate label stacked arbitrarily deep", () => {
      it("catches depth 2 (the original shipped shape)", () => {
        expect(isPlaceholderTopic("Module 08: Module 08")).toBe(true);
      });

      it("catches depth 3", () => {
        expect(isPlaceholderTopic("Module 08: Module 08: Module 08")).toBe(true);
      });

      it("catches depth 4", () => {
        expect(isPlaceholderTopic("Module 08: Module 08: Module 08: Module 08")).toBe(true);
      });

      it("catches depth 5", () => {
        expect(isPlaceholderTopic("Module 08: Module 08: Module 08: Module 08: Module 08")).toBe(true);
      });

      it("catches depth 3 using the ' - ' separator throughout", () => {
        expect(isPlaceholderTopic("Module 08 - Module 08 - Module 08")).toBe(true);
      });

      it("catches depth 4 using the ' - ' separator throughout", () => {
        expect(isPlaceholderTopic("Module 08 - Module 08 - Module 08 - Module 08")).toBe(true);
      });

      it("catches depth 3 with mixed separators (dash then colon)", () => {
        expect(isPlaceholderTopic("Module 08 - Module 08: Module 08")).toBe(true);
      });

      it("catches depth 4 with mixed separators (colon then dash then colon)", () => {
        expect(isPlaceholderTopic("Module 08: Module 08 - Module 08: Module 08")).toBe(true);
      });

      it("terminates on a large, artificially deep stack (50 layers) instead of hanging or growing unbounded", () => {
        const deepStack = Array.from({ length: 50 }, () => "Module 08").join(": ");
        expect(isPlaceholderTopic(deepStack)).toBe(true);
      });
    });

    describe("termination on adversarial, non-label-shaped input", () => {
      // No digits at all, so no bare label is ever recognized - must resolve
      // immediately (peeling never starts) rather than loop.
      it("does not hang on repeated structural words with no numbers", () => {
        expect(isPlaceholderTopic("Module Module Module")).toBe(false);
      });

      // Two bare-looking labels separated only by whitespace, with no colon
      // or dash - splitLabelAndRest recognizes neither separator here, so
      // peeling must stop on the very first call rather than loop.
      it("does not hang on a label with no separator between repeats", () => {
        expect(isPlaceholderTopic("Module 08 Module 08")).toBe(false);
      });
    });
  });

  describe("real topics it must NOT catch (getting this boundary right is the whole job)", () => {
    it("passes a colon-separated label plus a real subject - the exact real-run counterexample", () => {
      expect(isPlaceholderTopic("Module 08: Inheritance and Polymorphism")).toBe(false);
    });

    it("passes a bare week label plus a real subject", () => {
      expect(isPlaceholderTopic("Week 3: Recursion")).toBe(false);
    });

    it("passes a dash-separated unit label plus a real subject", () => {
      expect(isPlaceholderTopic("Unit 5 - Normalization")).toBe(false);
    });

    it("passes the instructor's actual module title verbatim - the exact boundary this fix must not regress", () => {
      // Pulled verbatim from the bug report: a genuine dash-separated module
      // title, not a duplicated label. Must keep passing as real no matter
      // how the placeholder detector's peeling is implemented.
      expect(isPlaceholderTopic("Module 08 - Survey of Object Oriented Programming")).toBe(false);
    });

    it("passes a deep stack of duplicate labels that ENDS in a real subject - the subject must survive peeling", () => {
      // Three redundant leading labels, but the fourth segment is genuine
      // subject matter. Depth-independent peeling must not discard it along
      // with the placeholder layers in front of it.
      expect(isPlaceholderTopic("Module 08: Module 08: Module 08: Survey of Object Oriented Programming")).toBe(
        false
      );
    });

    it("passes a multi-segment topic when the real segment sits behind a DEEP placeholder segment", () => {
      // Extends the existing "one real segment keeps the whole topic real"
      // rule to a depth-3 placeholder segment, confirming the join logic and
      // the depth-independent peeling compose correctly together.
      expect(
        isPlaceholderTopic("Module 08: Module 08: Module 08; Module 09: Recursion")
      ).toBe(false);
    });

    it("passes a real subject with no structural label at all", () => {
      expect(isPlaceholderTopic("Recursion")).toBe(false);
      expect(isPlaceholderTopic("Object-Oriented Programming")).toBe(false);
    });

    it("passes a joined topic when at least one segment carries a real subject", () => {
      expect(isPlaceholderTopic("Module 08: Module 08; Module 09: Recursion")).toBe(false);
      expect(isPlaceholderTopic("Start Here; Module 01: Variables and Data Types")).toBe(false);
    });

    it("passes a subject that itself starts with a structural word but isn't a bare label", () => {
      // "Module" used as a real subject noun (e.g. a hardware/electronics
      // course), not as this app's own numbering vocabulary.
      expect(isPlaceholderTopic("Module Design Patterns")).toBe(false);
    });

    it("does not mistake the existing Review sentinel for a placeholder", () => {
      // courseStructureToSchedule's own empty-bucket sentinel (course-
      // structure-schedule.ts) - already a deliberate, correctly-labeled
      // placeholder with its own downstream handling; this detector must
      // leave it alone rather than double-flagging it.
      expect(isPlaceholderTopic("Review")).toBe(false);
    });
  });
});

describe("isFileManifestSummary", () => {
  it("catches the real week-2 manifest (a single deliverable placeholder)", () => {
    expect(isFileManifestSummary("Covers: Week 02 Deliverable")).toBe(true);
  });

  it("catches the real week-8 manifest (files this run generates, an announcement, and a deliverable)", () => {
    expect(
      isFileManifestSummary(
        "Covers: INFO 1020 - Significance of the Material - Module 08.docx, INFO 1020 - Lecture Slides - Week 8.pptx, Week 8 Announcement - Module 08.docx, Week 08 Deliverable"
      )
    ).toBe(true);
  });

  it("catches courseStructureToSchedule's own zero-content fallback sentence", () => {
    expect(isFileManifestSummary("No items listed for this module.")).toBe(true);
  });

  it("is case-insensitive on the fallback sentence and tolerates a missing trailing period", () => {
    expect(isFileManifestSummary("no items listed for this module")).toBe(true);
  });

  it("does not catch a real content summary, even though it uses the same 'Covers:' prefix", () => {
    expect(isFileManifestSummary("Covers: Recursion, iterative vs recursive solutions, Fibonacci sequence")).toBe(
      false
    );
  });

  it("does not catch a summary with real items alongside administrative ones - one real item is enough to ground the week", () => {
    expect(isFileManifestSummary("Covers: Reading Chapter 3, Week 08 Deliverable")).toBe(false);
  });

  it("does not catch a blank summary (the caller's own blank check handles that case)", () => {
    expect(isFileManifestSummary("")).toBe(false);
    expect(isFileManifestSummary("   ")).toBe(false);
  });

  it("does not catch a summary with no 'Covers:' prefix at all", () => {
    expect(isFileManifestSummary("A hands-on look at recursion and its applications.")).toBe(false);
  });

  it("catches a manifest whose only item is a real course file extension with no deliverable/announcement wording", () => {
    expect(isFileManifestSummary("Covers: syllabus.pdf")).toBe(true);
  });
});

describe("summaryNamesGeneratedFile", () => {
  it("flags the real week-8 summary, which names this run's own Lecture Slides deck", () => {
    expect(
      summaryNamesGeneratedFile(
        "Covers: INFO 1020 - Significance of the Material - Module 08.docx, INFO 1020 - Lecture Slides - Week 8.pptx, Week 8 Announcement - Module 08.docx, Week 08 Deliverable"
      )
    ).toBe(true);
  });

  it("flags a summary naming any of this pipeline's generated-artifact labels", () => {
    expect(summaryNamesGeneratedFile("Covers: Assignment Instructions - Week 3")).toBe(true);
    expect(summaryNamesGeneratedFile("Covers: Module Objectives, Class Opener")).toBe(true);
  });

  it("flags a summary naming a file with a generated document extension", () => {
    expect(summaryNamesGeneratedFile("Covers: Week 3 Overview.docx")).toBe(true);
  });

  it("does not flag the real week-2 summary, which names only a deliverable placeholder", () => {
    expect(summaryNamesGeneratedFile("Covers: Week 02 Deliverable")).toBe(false);
  });

  it("does not flag a real content summary", () => {
    expect(summaryNamesGeneratedFile("Covers: Recursion, Big-O notation")).toBe(false);
  });

  it("does not flag a blank or non-manifest summary", () => {
    expect(summaryNamesGeneratedFile("")).toBe(false);
    expect(summaryNamesGeneratedFile("A hands-on look at recursion.")).toBe(false);
  });
});
