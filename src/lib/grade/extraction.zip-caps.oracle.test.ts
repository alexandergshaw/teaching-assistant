// ZIP-BOMB-CAPS W1 step 0 (docs/zip-bomb-caps-scope.md I7): the frozen
// fold-equivalence oracle. The expected values below were CAPTURED FROM THE
// UNCHANGED TREE (HEAD b0d3a1ce..174d4b9b, before any zip-caps edit) and pasted
// as literals; they are never re-derived. The wave replaces the double
// decompress (async("string") + async("base64")) with one bounded read plus
// native Buffer conversions; this file proves the output is byte-identical,
// and that a legitimate owner-shaped archive PASSES the default caps.
//
// Order note (scope D7): the key ORDER of `submissions` changes from
// completion order to archive order, so every comparison here is
// order-insensitive (sorted keys, sorted file names, content LENGTH).
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { extractSubmissions, extractStudentEntries } from "./extraction";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Deterministic pseudo-random bytes (LCG), so the fixture never varies. */
function seededBytes(length: number, seed: number): Buffer {
  const out = Buffer.allocUnsafeSlow(length);
  let state = seed >>> 0;
  for (let i = 0; i < length; i += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    out[i] = state >>> 24;
  }
  return out;
}

async function docxBuffer(paragraph: string): Promise<Buffer> {
  const zip = new JSZip();
  // A fixed entry date: JSZip stamps the current time otherwise (also on the auto-created
  // "word/" folder entry, hence createFolders: false), and the docx
  // bytes (hence their base64 hash) would differ on every run.
  zip.file(
    "word/document.xml",
    `<w:document><w:body><w:p><w:t>${paragraph}</w:t></w:p></w:body></w:document>`,
    { date: new Date(Date.UTC(2020, 0, 1)), createFolders: false }
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

/** The encoding sub-fixture: the classic decoder-divergence inputs. */
const ENCODING_FIXTURES: ReadonlyArray<readonly [string, Buffer]> = [
  ["bom", Buffer.from([0xef, 0xbb, 0xbf, 0x68, 0x65, 0x6c, 0x6c, 0x6f])],
  ["invalid", Buffer.from([0x61, 0x62, 0xc3, 0x28, 0xff, 0xfe, 0x63, 0x64])],
  [
    "wide",
    Buffer.from([
      0xf0, 0x9f, 0x98, 0x80, 0x20, 0xe6, 0x97, 0xa5, 0xe6, 0x9c, 0xac, 0xe8, 0xaa, 0x9e, 0x20,
      0xf0, 0x9d, 0x92, 0xb3,
    ]),
  ],
  ["crlf", Buffer.from([0x61, 0x0d, 0x0a, 0x62, 0x0d, 0x0a])],
  ["nul", Buffer.from([0x61, 0x00, 0x62])],
  ["trunc-end", Buffer.from([0x6f, 0x6b, 0x20, 0xf0, 0x9f, 0x98])],
  ["trunc-mid", Buffer.from([0xf0, 0x9f, 0x98, 0x78, 0x79])],
];

async function buildOwnerShapeZip(): Promise<ArrayBuffer> {
  const deepest = new JSZip();
  deepest.file("leaf.txt", "leaf at the deepest opened level");
  deepest.file("toodeep.zip", seededBytes(64, 11));
  const deepBuffer = await deepest.generateAsync({ type: "nodebuffer" });

  const inner = new JSZip();
  inner.file("deep.txt", "deep text");
  inner.file("deep.zip", deepBuffer);
  const innerBuffer = await inner.generateAsync({ type: "nodebuffer" });

  const bundle = new JSZip();
  bundle.file("main.py", "print('erin')\n");
  bundle.file("shot.png", seededBytes(40000, 21));
  bundle.file("notes.docx", await docxBuffer("erin notes"));
  bundle.file("inner.zip", innerBuffer);
  const bundleBuffer = await bundle.generateAsync({ type: "nodebuffer" });

  const outer = new JSZip();
  const linkHtml = (url: string): string =>
    [
      "<html><head>",
      `<meta http-equiv="Refresh" content="0; url=${url}" />`,
      "</head><body>",
      `<a href="${url}">Click Here to go to the submission</a>`,
      "<p>This submission was a url, we're taking you to the url link now.</p>",
      "</body></html>",
    ].join("\n");

  outer.folder("HW1");
  outer.file("HW1/alice_1001_2001_essay.docx", await docxBuffer("alice essay body"));
  outer.file("HW1/alice_1001_2001_notes.txt", "alice notes\nsecond line\n");
  outer.file("HW1/alice_1001_2001_shot1.png", seededBytes(60000, 31));
  outer.file("HW1/alice_1001_2001_shot2.png", seededBytes(60000, 32));
  outer.file("HW1/bob_1002_2002_report.docx", await docxBuffer("bob report body"));
  outer.file("HW1/bob_1002_2002_code.py", "def f():\n    return 1\n");
  outer.file("HW1/bob_1002_2002_screen.png", seededBytes(50000, 33));
  outer.file("HW1/carol_1003_2003_slides.docx", await docxBuffer("carol slides body"));
  outer.file("HW1/carol_1003_2003_data.csv", "a,b\n1,2\n");
  outer.file("HW1/carol_1003_2003_pic.png", seededBytes(45000, 34));
  for (const [label, bytes] of ENCODING_FIXTURES) {
    outer.file(`HW1/dana_1004_2004_enc-${label}.txt`, bytes);
  }
  outer.file("HW1/erin_1005_2005_bundle.zip", bundleBuffer);
  outer.file("HW1/fay_1006_2006_link.html", linkHtml("https://example.com/fay/project"));
  outer.file("HW1/gus_1007_2007_link.html", linkHtml("https://example.org/gus/work"));
  outer.file("HW1/hal_1008_2008_broken.docx", "this is not a real docx");
  outer.file("HW1/hal_1008_2008_scan1.pdf", seededBytes(2000, 41));
  outer.file("HW1/hal_1008_2008_scan2.pdf", seededBytes(2000, 42));
  outer.file("HW1/hal_1008_2008_clip.mp4", seededBytes(3000, 43));
  outer.file("HW1/hal_1008_2008_README", "no extension");

  return outer.generateAsync({ type: "arraybuffer" });
}

interface OracleSnapshot {
  readonly keys: string[];
  readonly submissionSha: Record<string, string>;
  readonly rawSha: Record<string, string>;
  readonly zipParents: Record<string, string[]>;
  readonly attemptedSupportedFiles: number;
  readonly failedSupportedFiles: string[];
  readonly entries: Array<{
    student: string;
    contentLength: number;
    mergedFileCount: number;
    files: string[];
  }>;
}

async function takeSnapshot(): Promise<OracleSnapshot> {
  const result = await extractSubmissions(await buildOwnerShapeZip());
  const keys = Object.keys(result.submissions).sort();
  const submissionSha: Record<string, string> = {};
  const rawSha: Record<string, string> = {};
  for (const key of keys) {
    submissionSha[key] = sha256(result.submissions[key]);
  }
  for (const key of Object.keys(result.rawData).sort()) {
    rawSha[key] = sha256(result.rawData[key]);
  }
  const zipParents: Record<string, string[]> = {};
  for (const key of Object.keys(result.zipParents).sort()) {
    zipParents[key] = result.zipParents[key];
  }
  const grouped = await extractStudentEntries(await buildOwnerShapeZip());
  const entries = grouped
    .map((entry) => ({
      student: entry.student,
      contentLength: entry.content.length,
      mergedFileCount: entry.mergedFileCount,
      files: entry.submittedFiles.map((file) => `${file.name}|${sha256(file.rawBase64 ?? "")}`).sort(),
    }))
    .sort((a, b) => a.student.localeCompare(b.student));
  return {
    keys,
    submissionSha,
    rawSha,
    zipParents,
    attemptedSupportedFiles: result.attemptedSupportedFiles,
    failedSupportedFiles: [...result.failedSupportedFiles].sort(),
    entries,
  };
}

/** Captured from the unchanged tree (HEAD) before any zip-caps edit. */
/** Captured from the unchanged tree (HEAD) before any zip-caps edit. */
const EXPECTED: OracleSnapshot = {
  keys: [
    "HW1/alice_1001_2001_essay.docx",
    "HW1/alice_1001_2001_notes.txt",
    "HW1/alice_1001_2001_shot1.png",
    "HW1/alice_1001_2001_shot2.png",
    "HW1/bob_1002_2002_code.py",
    "HW1/bob_1002_2002_report.docx",
    "HW1/bob_1002_2002_screen.png",
    "HW1/carol_1003_2003_data.csv",
    "HW1/carol_1003_2003_pic.png",
    "HW1/carol_1003_2003_slides.docx",
    "HW1/dana_1004_2004_enc-bom.txt",
    "HW1/dana_1004_2004_enc-crlf.txt",
    "HW1/dana_1004_2004_enc-invalid.txt",
    "HW1/dana_1004_2004_enc-nul.txt",
    "HW1/dana_1004_2004_enc-trunc-end.txt",
    "HW1/dana_1004_2004_enc-trunc-mid.txt",
    "HW1/dana_1004_2004_enc-wide.txt",
    "HW1/erin_1005_2005_bundle.zip/inner.zip/deep.txt",
    "HW1/erin_1005_2005_bundle.zip/inner.zip/deep.zip/leaf.txt",
    "HW1/erin_1005_2005_bundle.zip/main.py",
    "HW1/erin_1005_2005_bundle.zip/notes.docx",
    "HW1/erin_1005_2005_bundle.zip/shot.png",
    "HW1/fay_1006_2006_link.html",
    "HW1/gus_1007_2007_link.html"
  ],
  submissionSha: {
    "HW1/alice_1001_2001_essay.docx": "71babed4fbed2c686ced176b9370ec9ff5a605098c3902b3ed3438b447ad4639",
    "HW1/alice_1001_2001_notes.txt": "be189a869b830230fbba50ffcf84cf35df3e11b3068f736baa8821421db4a8dc",
    "HW1/alice_1001_2001_shot1.png": "2f62d55bca8ff119f9cd3c0ecc1b44668479d1d7737f930941eae56b611e4a04",
    "HW1/alice_1001_2001_shot2.png": "28924c48500cfdf91fba5094d5935815acf99e32a18ba7cda590177906d4e7b6",
    "HW1/bob_1002_2002_code.py": "5b76d0962c09ab4ee309fac65fad3568c97abdec983b405146ae3e86a235e352",
    "HW1/bob_1002_2002_report.docx": "9a191e5674dc573529580738ca81dc757dbdc48f38e36195fda2c94485ca7b31",
    "HW1/bob_1002_2002_screen.png": "c52e97c7ff7820358d9cf24cddda15930a9eefd27451aa6b4556f5adf32ab398",
    "HW1/carol_1003_2003_data.csv": "492d5ea496056f1a6a6592241032fab764c321596317930b4fa0e1e8bc3b7470",
    "HW1/carol_1003_2003_pic.png": "06c479d1ff86d672891f7db69b2322aed1bcf18405f9b1d887ca839d5e67acbe",
    "HW1/carol_1003_2003_slides.docx": "c48bcb8068d249bc84bcba60abd90ef9758e71d79f284951f77822a5aaf607d2",
    "HW1/dana_1004_2004_enc-bom.txt": "7489ebbcc2a00056ddaaaac190bce473e5c03696ea1bd8ed83cf59a174283862",
    "HW1/dana_1004_2004_enc-crlf.txt": "58055bdcc73787eb88c78d36f0b4939e9c5dc1c3ad17e25cc85a6833cf1a0cab",
    "HW1/dana_1004_2004_enc-invalid.txt": "7ce6dfa9030843dff59bbfdae38e6be374d1046e56ffa2e2c95246127ff9c71d",
    "HW1/dana_1004_2004_enc-nul.txt": "59b271ae1bbcb1d31d41929817f4b16fb439eb4f31520b5ad1d5ce98920a7138",
    "HW1/dana_1004_2004_enc-trunc-end.txt": "eba68b6445845d32113253752b485fc2cf06e386dd5d3d6d4b28901ff8ff06a4",
    "HW1/dana_1004_2004_enc-trunc-mid.txt": "2ce361a59fc8d6d9e0759686d73a46d805a554ed763fcd6a77256600a548d6b4",
    "HW1/dana_1004_2004_enc-wide.txt": "d916ad0bc6946134d15304f058f18536b760305ea86befbbd5e65c208afc7e67",
    "HW1/erin_1005_2005_bundle.zip/inner.zip/deep.txt": "17d9865b2423aca1fce435327a5be49869b88759adc27225e7b5a66c348a0740",
    "HW1/erin_1005_2005_bundle.zip/inner.zip/deep.zip/leaf.txt": "b79b259cb069f38e542ae775dc02ee3a4a2dc6031423d1e8ea01cf4869ad4d53",
    "HW1/erin_1005_2005_bundle.zip/main.py": "e9620d8d1af5223bc9e2755a2ae0041dd40c4ba91a8f3be69d1c2059e558508e",
    "HW1/erin_1005_2005_bundle.zip/notes.docx": "14ff5faf3cf01ace2cbf41309ebd2eee782f9d244d864b935deaf1dcf9a57951",
    "HW1/erin_1005_2005_bundle.zip/shot.png": "2428e4784b4e626817097fa6c48112187d55c5f1a90b1e797bbaf1ee1a9b361a",
    "HW1/fay_1006_2006_link.html": "aa979b8b2a292ec0f05903326f0c25fee3ff1096253ebb97005756fa27cbc423",
    "HW1/gus_1007_2007_link.html": "e46a432a93eba4d35d82e5df838188cf47f1ce1e4511aa8059f61e393c88ab50"
  },
  rawSha: {
    "HW1/alice_1001_2001_essay.docx": "2eefb09bdd4fcbdf47ea262ba0a2d1c904096c05a0ac73f027395d18adc958ff",
    "HW1/alice_1001_2001_notes.txt": "f9a64b550c3fb355368e45fd04dbfea8b44b8d208829cafd65924dccbdd8f0f1",
    "HW1/alice_1001_2001_shot1.png": "2f089b0df405e8d2f7ec1c3646984bfd130f5fbcef1bdb1ba71bae1ebb24477a",
    "HW1/alice_1001_2001_shot2.png": "9bf4bf0e7b0ef50e579e498fef585528adc1ee6c4f4526680197ca07242b11cf",
    "HW1/bob_1002_2002_code.py": "d7cf327e3377aa389dc07695d5658f1183fefffe36c30e7e53c7160d4844ea67",
    "HW1/bob_1002_2002_report.docx": "4830f89f93f8858b75a5507cf3382bdcefd191c08af1e95aef440be5e21d40e5",
    "HW1/bob_1002_2002_screen.png": "d5d4d0d0521f24b32ba533c172c058671d96714d4dcddcee1f8cb27e09377e0d",
    "HW1/carol_1003_2003_data.csv": "00b6eb6152e2460fd26c8f891a2dc3aab56798cea56c094305580bff9b151d27",
    "HW1/carol_1003_2003_pic.png": "8d0397ba1d28149bc8e9c0f10806a44d6d98331ab05c77795cc6aeb8f68992ed",
    "HW1/carol_1003_2003_slides.docx": "6e9c8d8075822f5224b04d8de5000223c7c47b6a616445c214fcb921d96cb471",
    "HW1/dana_1004_2004_enc-bom.txt": "f19a3c55b15b3d975d72ed86b016d6bd6a1a3e4b1d4f6ed2fc947e13d54916c6",
    "HW1/dana_1004_2004_enc-crlf.txt": "28facc63d1b31350d6bc50bd20d30d780f82b51f77fe88b34d263d4e86fd3233",
    "HW1/dana_1004_2004_enc-invalid.txt": "990500b398fe73d44c83a1391a7f4258d8e0a22eef79f6b3b5f675ea6df6617c",
    "HW1/dana_1004_2004_enc-nul.txt": "e6ed7e6cf9cbe7648ee9ff56358f389ac0d87b079c0f3c671870eb22fd183284",
    "HW1/dana_1004_2004_enc-trunc-end.txt": "852ebe069e77cd9411e3138e12a88d72110dc8b3452e94892f455aaf490f176f",
    "HW1/dana_1004_2004_enc-trunc-mid.txt": "adc7577a70663561d49cb660482ae4855b5f7740c3d6ed44cbd707debe67704d",
    "HW1/dana_1004_2004_enc-wide.txt": "3b18eea65d3e7d7f82c7b237cb1f8733325f96b339e6d39b89e75ae3896e9e8f",
    "HW1/erin_1005_2005_bundle.zip/inner.zip/deep.txt": "585cda93c539ca044e8a8186db5901dd0b0ae3f6ba6fe2742f3491de9154268c",
    "HW1/erin_1005_2005_bundle.zip/inner.zip/deep.zip/leaf.txt": "871ca435ed404f82c5a3561758462e8d284ba04ad02df8ee10f36cdba8759a34",
    "HW1/erin_1005_2005_bundle.zip/main.py": "64cb876d85b25d6aab7374acc61014dfb2ef490fc599b7201996ab9b196a6d03",
    "HW1/erin_1005_2005_bundle.zip/notes.docx": "af79ff4cad197000e4a233abb907f1b64f4cb3e5d662198ef579be72817fc48b",
    "HW1/erin_1005_2005_bundle.zip/shot.png": "130dfcecc86213386dcfa9ba84bc18f3327605e4bd68cb4e198daca936dd9a7d",
    "HW1/fay_1006_2006_link.html": "58197ff4df536800a10a24b1cbb6ec4ced0e675d2c182b4ac25fad0d8aa6cd1f",
    "HW1/gus_1007_2007_link.html": "5cfc20ff8ada9a80d1bd1b0d7c93f12159881c1d16582268914828a67927b47c"
  },
  zipParents: {
    "HW1/erin_1005_2005_bundle.zip/inner.zip/deep.txt": [
      "HW1/erin_1005_2005_bundle.zip",
      "HW1/erin_1005_2005_bundle.zip/inner.zip"
    ],
    "HW1/erin_1005_2005_bundle.zip/inner.zip/deep.zip/leaf.txt": [
      "HW1/erin_1005_2005_bundle.zip",
      "HW1/erin_1005_2005_bundle.zip/inner.zip",
      "HW1/erin_1005_2005_bundle.zip/inner.zip/deep.zip"
    ],
    "HW1/erin_1005_2005_bundle.zip/main.py": [
      "HW1/erin_1005_2005_bundle.zip"
    ],
    "HW1/erin_1005_2005_bundle.zip/notes.docx": [
      "HW1/erin_1005_2005_bundle.zip"
    ],
    "HW1/erin_1005_2005_bundle.zip/shot.png": [
      "HW1/erin_1005_2005_bundle.zip"
    ]
  },
  attemptedSupportedFiles: 22,
  failedSupportedFiles: [
    "HW1/hal_1008_2008_broken.docx",
    "HW1/hal_1008_2008_scan1.pdf",
    "HW1/hal_1008_2008_scan2.pdf"
  ],
  entries: [
    {
      student: "alice",
      contentLength: 208,
      mergedFileCount: 4,
      files: [
        "essay.docx|2eefb09bdd4fcbdf47ea262ba0a2d1c904096c05a0ac73f027395d18adc958ff",
        "notes.txt|f9a64b550c3fb355368e45fd04dbfea8b44b8d208829cafd65924dccbdd8f0f1",
        "shot1.png|2f089b0df405e8d2f7ec1c3646984bfd130f5fbcef1bdb1ba71bae1ebb24477a",
        "shot2.png|9bf4bf0e7b0ef50e579e498fef585528adc1ee6c4f4526680197ca07242b11cf"
      ]
    },
    {
      student: "bob",
      contentLength: 141,
      mergedFileCount: 3,
      files: [
        "code.py|d7cf327e3377aa389dc07695d5658f1183fefffe36c30e7e53c7160d4844ea67",
        "report.docx|4830f89f93f8858b75a5507cf3382bdcefd191c08af1e95aef440be5e21d40e5",
        "screen.png|d5d4d0d0521f24b32ba533c172c058671d96714d4dcddcee1f8cb27e09377e0d"
      ]
    },
    {
      student: "carol",
      contentLength: 126,
      mergedFileCount: 3,
      files: [
        "data.csv|00b6eb6152e2460fd26c8f891a2dc3aab56798cea56c094305580bff9b151d27",
        "pic.png|8d0397ba1d28149bc8e9c0f10806a44d6d98331ab05c77795cc6aeb8f68992ed",
        "slides.docx|6e9c8d8075822f5224b04d8de5000223c7c47b6a616445c214fcb921d96cb471"
      ]
    },
    {
      student: "dana",
      contentLength: 232,
      mergedFileCount: 7,
      files: [
        "enc-bom.txt|f19a3c55b15b3d975d72ed86b016d6bd6a1a3e4b1d4f6ed2fc947e13d54916c6",
        "enc-crlf.txt|28facc63d1b31350d6bc50bd20d30d780f82b51f77fe88b34d263d4e86fd3233",
        "enc-invalid.txt|990500b398fe73d44c83a1391a7f4258d8e0a22eef79f6b3b5f675ea6df6617c",
        "enc-nul.txt|e6ed7e6cf9cbe7648ee9ff56358f389ac0d87b079c0f3c671870eb22fd183284",
        "enc-trunc-end.txt|852ebe069e77cd9411e3138e12a88d72110dc8b3452e94892f455aaf490f176f",
        "enc-trunc-mid.txt|adc7577a70663561d49cb660482ae4855b5f7740c3d6ed44cbd707debe67704d",
        "enc-wide.txt|3b18eea65d3e7d7f82c7b237cb1f8733325f96b339e6d39b89e75ae3896e9e8f"
      ]
    },
    {
      student: "erin",
      contentLength: 196,
      mergedFileCount: 5,
      files: [
        "deep.txt|585cda93c539ca044e8a8186db5901dd0b0ae3f6ba6fe2742f3491de9154268c",
        "leaf.txt|871ca435ed404f82c5a3561758462e8d284ba04ad02df8ee10f36cdba8759a34",
        "main.py|64cb876d85b25d6aab7374acc61014dfb2ef490fc599b7201996ab9b196a6d03",
        "notes.docx|af79ff4cad197000e4a233abb907f1b64f4cb3e5d662198ef579be72817fc48b",
        "shot.png|130dfcecc86213386dcfa9ba84bc18f3327605e4bd68cb4e198daca936dd9a7d"
      ]
    },
    {
      student: "fay",
      contentLength: 187,
      mergedFileCount: 1,
      files: [
        "link.html|e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
      ]
    },
    {
      student: "gus",
      contentLength: 181,
      mergedFileCount: 1,
      files: [
        "link.html|e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
      ]
    }
  ]
};

const FFFD = String.fromCharCode(0xfffd);
const BOM = String.fromCharCode(0xfeff);

describe("extractSubmissions - frozen fold-equivalence oracle (I7)", () => {
  it("an owner-shaped archive passes the default caps and matches the HEAD-captured output", async () => {
    expect(await takeSnapshot()).toEqual(EXPECTED);
  }, 60000);

  it("decodes the classic encoding hazards exactly as HEAD did (BOM kept, one U+FFFD per truncated sequence)", async () => {
    const { submissions } = await extractSubmissions(await buildOwnerShapeZip());
    const text = (label: string): string => submissions[`HW1/dana_1004_2004_enc-${label}.txt`];
    expect(text("bom")).toBe(BOM + "hello");
    expect(text("trunc-end")).toBe("ok " + FFFD);
    expect(text("trunc-mid")).toBe(FFFD + "xy");
    expect(text("crlf")).toBe("a\r\nb\r\n");
    expect(text("nul")).toBe("a" + String.fromCharCode(0) + "b");
    expect(text("invalid").startsWith("ab" + FFFD)).toBe(true);
  }, 60000);
});
