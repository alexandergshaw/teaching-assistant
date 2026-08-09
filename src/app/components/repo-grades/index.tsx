"use client";

import TabHeader from "../TabHeader";
import styles from "../../page.module.css";

/**
 * Repo Grades: a Manual subtab that will list every student repo in a course
 * tile's GitHub org, enumerate each repo's assignment folders, and post
 * grades for them to the Canvas gradebook. Full spec:
 * docs/repo-grades-view-acceptance-criteria.md.
 *
 * This is the navigation-shell wave only (AC1, items 1-4 of that doc): the
 * subtab exists and is reachable via ?tab=manual&manualView=repo-grades, but
 * this component is scaffolding - it renders nothing but the header and an
 * empty state. The grid (AC4), the bounded-concurrency GitHub tree scan
 * (AC3), the roster-binding UI (AC2), and grade posting (AC5) are later
 * waves and are deliberately not started here: no fetch, no server action,
 * and no course picker in this file.
 */
export default function RepoGradesTab() {
  return (
    <div className={styles.tabContainer}>
      <TabHeader
        eyebrow="Grading"
        title="Repo Grades"
        subtitle="Grade every student's GitHub repo folder by folder and post the results to the Canvas gradebook."
      />
      <p className={styles.emptyState}>
        This view is not built yet. Once it is, it will list every student repo in
        a course tile&apos;s GitHub org, help you bind each repo to the roster student
        it belongs to, enumerate that repo&apos;s assignment folders as grid columns,
        and post grades to Canvas through the app&apos;s existing grade-writing
        action - the same one the rest of the app already uses. It will need a
        course tile with a GitHub org configured before there is anything to
        show.
      </p>
    </div>
  );
}
