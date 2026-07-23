const VOICE_SAMPLE_SCRIPT = `Hello, and welcome to today's session. This is a sample of my natural speaking voice, recorded so it can be cloned for course narration.

When I teach, I try to keep things simple: one idea at a time, explained clearly, with room to breathe. Some sentences are short. Others stretch a little longer, winding through an example or two before they land, because that is how real explanations sound.

Let's try some variety. How do computers store information? Why does a loop repeat, and when should it stop? Questions like these lift my tone at the end, while statements settle back down.

Here are a few specifics: on March 3rd, 2026, at 9:45 in the morning, exactly 127 students submitted assignment number 6. About 83 percent passed on the first try - a strong result, though not a perfect one.

Now for texture: the quick brown fox jumps over the lazy dog, while five jazzy wizards begin to quickly vex the judge. Think of thirty-three thankful thoughts, and measure the pleasure of a treasured vision.

Finally, a calm close. Thank you for listening carefully. Take a breath, review your notes, and remember: steady practice beats last-minute cramming every single time.`;

type BusyState = "idle" | "extracting" | "narrating";

interface NarrationSegment {
  start: number;
  end: number;
  text: string;
}

export { VOICE_SAMPLE_SCRIPT, type BusyState, type NarrationSegment };
