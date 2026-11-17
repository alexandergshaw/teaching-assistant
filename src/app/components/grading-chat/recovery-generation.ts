/** Invalidate any pending async archive inspection before replacing its inputs. */
export function invalidateRecoveryGeneration(generation: { current: number }): void {
  generation.current += 1;
}

export interface AutomaticRecovery {
  readonly file: File;
  readonly labels: readonly string[];
  readonly generation: number;
  readonly identityGroup?: string;
  readonly identityStudent?: string;
}

/** Automatic admission is bound to the exact inspection and incoming props. */
export function automaticRecoveryIsCurrent(automatic: AutomaticRecovery | null, generation: number, displayed: File | null, incoming: File | null | undefined, identityGroup?: string, identityStudent?: string): automatic is AutomaticRecovery {
  return !!automatic && automatic.generation === generation && automatic.file === displayed && automatic.file === incoming && automatic.identityGroup === identityGroup && automatic.identityStudent === identityStudent;
}
