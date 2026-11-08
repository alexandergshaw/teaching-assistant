/** Owns pending screen pickers; a later request supersedes an earlier one. */
export function createCapturePicker() {
  let generation = 0;
  return {
    cancel() { generation += 1; },
    async request(open: () => Promise<MediaStream>, adopt: (stream: MediaStream) => void): Promise<MediaStream | null> {
      const ticket = ++generation;
      let stream: MediaStream;
      try {
        stream = await open();
      } catch (error) {
        if (ticket !== generation) return null;
        throw error;
      }
      if (ticket !== generation) {
        for (const track of stream.getTracks()) track.stop();
        return null;
      }
      adopt(stream);
      return stream;
    },
  };
}
