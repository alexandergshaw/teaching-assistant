import { describe, expect, it } from "vitest";
import { missingNotebookCsv } from "./missing-notebook-data";
const code = "import pandas as pd\ndf = pd.read_csv('data/soc_alert_data.csv')";
const notebook = (source = code) => ({ name: "optimization_engine.ipynb", extension: "ipynb", previewContent: JSON.stringify({ nbformat: 4, nbformat_minor: 5, cells: [{ cell_type: "code", source, outputs: [] }] }), previewTruncated: false });
const inventory = () => ({ source: "owner/repo @ sha", scope: { kind: "repository" as const, path: null }, enumerationComplete: true, files: [{ path: "optimization_engine.ipynb", content: "read" as const }] });
describe("referenced notebook CSV evidence", () => {
  it("identifies a literal CSV absent from a complete repository snapshot", () => expect(missingNotebookCsv([notebook()], [inventory()])).toBe("data/soc_alert_data.csv"));
  it("does not flag an existing path even if its contents are unsupported", () => expect(missingNotebookCsv([notebook()], [{ ...inventory(), files: [...inventory().files, { path: "data/soc_alert_data.csv", content: "unsupported" }] }])).toBeNull());
  it("does not hold a path explicitly generated earlier in the notebook", () => expect(missingNotebookCsv([notebook("import pandas as pd\ndf.to_csv('data/soc_alert_data.csv')\ndf = pd.read_csv('data/soc_alert_data.csv')")], [inventory()])).toBeNull());
  it("does not infer absence from incomplete, scoped, ambiguous or missing inventories", () => {
    const inv = inventory();
    for (const inventories of [undefined, [{ ...inv, enumerationComplete: false }], [{ ...inv, scope: { kind: "tree" as const, path: "data" } }], [inv, inv]]) expect(missingNotebookCsv([notebook()], inventories)).toBeNull();
  });
  it("does not interpret comments, dynamic paths, unimported aliases, or triple-quoted content as proven reads", () => {
    for (const source of ["import pandas as pd\n# df = pd.read_csv('data/a.csv')", "import pandas as pd\ndf = pd.read_csv(path)", "df = pd.read_csv('data/a.csv')", 'import pandas as pd\nx = """\ndf = pd.read_csv(\'data/a.csv\')\n"""']) expect(missingNotebookCsv([notebook(source)], [inventory()])).toBeNull();
  });
  it.each(["def unused():\n    pd.read_csv('data/a.csv')", "if flag:\n    df = pd.read_csv('data/a.csv')", "df = pd.read_csv('data/a.csv') if flag else other", "try:\n    df = pd.read_csv('data/a.csv')\nexcept FileNotFoundError:\n    pass"])("does not hold a conditional or nested read: %s", (body) => expect(missingNotebookCsv([notebook(`import pandas as pd\n${body}`)], [inventory()])).toBeNull());
  it("leaves direct uploads, partial notebook previews and nested notebooks to other evidence checks", () => {
    expect(missingNotebookCsv([notebook()], undefined)).toBeNull();
    expect(missingNotebookCsv([{ ...notebook(), previewTruncated: true }], [inventory()])).toBeNull();
    expect(missingNotebookCsv([{ ...notebook(), name: "src/work.ipynb" }], [inventory()])).toBeNull();
  });
});
