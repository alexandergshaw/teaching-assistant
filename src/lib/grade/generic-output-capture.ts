import { Writable } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import { MAX_GENERIC_OUTPUT_JSON_BYTES } from "./generic-execution-limits";
import { isBoundedJsonString } from "./jsonb-text-size";

/** Bound the JSON-encoded byte size, not JavaScript's character count. This
 * includes control-character escaping and preserves complete UTF-8 sequences. */
export function isBoundedGenericOutput(value: unknown): value is string {
  return isBoundedJsonString(value, MAX_GENERIC_OUTPUT_JSON_BYTES);
}

export function createGenericOutputCapture(maxJsonBytes = MAX_GENERIC_OUTPUT_JSON_BYTES): {
  stream: Writable; result: () => { text: string; truncated: boolean };
} {
  const decoder = new StringDecoder("utf8");
  let text = "", used = 2, truncated = false, full = false, finished = false;
  const append = (chunk: string) => {
    for (const rawCharacter of chunk) {
      if (full) break;
      // PostgreSQL jsonb cannot store U+0000. Retain an explicit replacement
      // and mark the output incomplete rather than losing the whole receipt.
      const character = rawCharacter === "\u0000" ? "\ufffd" : rawCharacter;
      if (character !== rawCharacter) truncated = true;
      const bytes = Buffer.byteLength(JSON.stringify(character), "utf8") - 2;
      if (used + bytes > maxJsonBytes) { truncated = true; full = true; break; }
      used += bytes;
      text += character;
    }
  };
  const finish = () => { if (!finished) { finished = true; append(decoder.end()); } };
  return {
    stream: new Writable({
      write(chunk: Buffer, _encoding, done) { append(decoder.write(chunk)); done(); },
      final(done) { finish(); done(); },
    }),
    result: () => { finish(); return { text, truncated }; },
  };
}
