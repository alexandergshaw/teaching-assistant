// User problems and their proposed solutions. Mirrors grading-drafts.ts:
// functions take an explicit SupabaseClient + userId (so the same code works
// from a browser session and from the service-role client via requireOwner()),
// every query is scoped with .eq("user_id", userId), and a cast-through-any
// table() helper works around the generated Database type.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";

export interface Problem {
  id: string;
  userId: string;
  title: string;
  detail: string;
  status: "open" | "resolved";
  createdAt: string;
  updatedAt: string;
}

export interface ProblemSolution {
  id: string;
  userId: string;
  problemId: string;
  title: string;
  approach: string;
  createdAt: string;
}

type ProblemRow = Database["public"]["Tables"]["problems"]["Row"];
type ProblemSolutionRow = Database["public"]["Tables"]["problem_solutions"]["Row"];

function mapProblem(row: ProblemRow): Problem {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    detail: row.detail,
    status: row.status as "open" | "resolved",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapProblemSolution(row: ProblemSolutionRow): ProblemSolution {
  return {
    id: row.id,
    userId: row.user_id,
    problemId: row.problem_id,
    title: row.title,
    approach: row.approach,
    createdAt: row.created_at,
  };
}

function problemTable(supabase: SupabaseClient<Database>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).from("problems");
}

function solutionTable(supabase: SupabaseClient<Database>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).from("problem_solutions");
}

export async function listProblems(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<Problem[]> {
  const { data, error } = await problemTable(supabase)
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as ProblemRow[]).map(mapProblem);
}

export async function createProblem(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: { title: string; detail?: string }
): Promise<Problem> {
  const { data, error } = await problemTable(supabase)
    .insert({
      user_id: userId,
      title: input.title,
      detail: input.detail ?? "",
    })
    .select("*")
    .single();
  if (error) {
    throw new Error(error.message);
  }
  return mapProblem(data as ProblemRow);
}

export async function updateProblem(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string,
  input: { title?: string; detail?: string; status?: "open" | "resolved" }
): Promise<void> {
  const updateObj: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) updateObj.title = input.title;
  if (input.detail !== undefined) updateObj.detail = input.detail;
  if (input.status !== undefined) updateObj.status = input.status;

  const { error } = await problemTable(supabase)
    .update(updateObj)
    .eq("user_id", userId)
    .eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteProblem(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string
): Promise<void> {
  const { error } = await problemTable(supabase)
    .delete()
    .eq("user_id", userId)
    .eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}

export async function listSolutionsForProblem(
  supabase: SupabaseClient<Database>,
  userId: string,
  problemId: string
): Promise<ProblemSolution[]> {
  const { data, error } = await solutionTable(supabase)
    .select("*")
    .eq("user_id", userId)
    .eq("problem_id", problemId)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as ProblemSolutionRow[]).map(mapProblemSolution);
}

export async function listAllSolutions(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<ProblemSolution[]> {
  const { data, error } = await solutionTable(supabase)
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as ProblemSolutionRow[]).map(mapProblemSolution);
}

export async function insertSolutions(
  supabase: SupabaseClient<Database>,
  userId: string,
  problemId: string,
  solutions: Array<{ title: string; approach: string }>
): Promise<void> {
  if (solutions.length === 0) return;

  const rows = solutions.map((sol) => ({
    user_id: userId,
    problem_id: problemId,
    title: sol.title,
    approach: sol.approach,
  }));

  const { error } = await solutionTable(supabase).insert(rows);
  if (error) {
    throw new Error(error.message);
  }
}
