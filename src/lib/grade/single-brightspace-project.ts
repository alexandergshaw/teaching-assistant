/** Recognize a single project in a specifically named Brightspace submission. */
export function singleBrightspaceProjectLookup(paths: readonly string[], parents: Record<string, string[]>, selection: { archiveName: string; student: string }) {
  const match = /^(\d+-\d+) - (.+?)-([A-Za-z]+ \d{1,2}, \d{4} \d{3,4} [AP]M)\.zip$/i.exec(selection.archiveName);
  if (!match || paths.length === 0 || paths.some((path) => (parents[path]?.length ?? 0) > 0 || /(?:^|\/)\d+-\d+ - /.test(path))) return undefined;
  const label = match[2].replace(/-/g, " ").trim();
  const tokens = (name: string) => name.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).sort().join(" ");
  if (selection.student.trim() && tokens(selection.student) !== tokens(label)) return undefined;
  const pieces = paths.map((path) => path.split("/"));
  const root = pieces[0][0];
  if (pieces.some((parts) => parts.length < 2 || parts[0] !== root) || !pieces.some((parts) => parts.length === 2 && /\.(?:cpp|cc|cxx|c|h|hpp)$/i.test(parts[1]))) return undefined;
  const projectDirs = new Set([root.toLocaleLowerCase(), ".vs", ".vscode", "src", "include", "build", "debug", "release", "x64", "x86", "bin", "obj"]);
  if (pieces.some((parts) => parts.length > 2 && !projectDirs.has(parts[1].toLocaleLowerCase()))) return undefined;
  return { byRaw: new Map(paths.map((path) => [path, { studentDisplay: selection.student.trim() || label, citationFileName: path }])) };
}
