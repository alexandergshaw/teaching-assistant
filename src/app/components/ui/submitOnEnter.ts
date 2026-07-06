import type { KeyboardEvent } from "react";

/** onKeyDown handler that runs `submit` when Enter is pressed (without Shift),
 *  for SINGLE-LINE inputs where Enter should trigger the primary action.
 *  Do NOT use on multiline fields. preventDefault stops any implicit form submit. */
export function submitOnEnter(submit: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };
}
