/** Release a microphone permission result if its display capture has ended. */
export async function attachRecordingMicrophone(
  display: MediaStream,
  request: () => Promise<MediaStream>,
  isCurrent: () => boolean,
): Promise<"recording" | "unavailable" | "cancelled"> {
  let microphone: MediaStream | undefined;
  try {
    microphone = await request();
    if (!isCurrent()) {
      microphone.getTracks().forEach(track => track.stop());
      return "cancelled";
    }
    const tracks = microphone.getAudioTracks();
    if (!tracks.length) { microphone.getTracks().forEach(track => track.stop()); return "unavailable"; }
    tracks.forEach(track => display.addTrack(track));
    return "recording";
  } catch {
    microphone?.getTracks().forEach(track => track.stop());
    return isCurrent() ? "unavailable" : "cancelled";
  }
}
