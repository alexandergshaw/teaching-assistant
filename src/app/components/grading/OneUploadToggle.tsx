import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import styles from "../../page.module.css";

type OneUploadToggleProps = {
  checked: boolean;
  onToggle: (next: boolean) => void;
  /** Shown (as a polite status) only while the mode is active. */
  statusText: string;
  active: boolean;
};

/** N15: the "each upload is one student" switch and its status line. */
export default function OneUploadToggle({ checked, onToggle, statusText, active }: OneUploadToggleProps) {
  return (
    <>
      <FormControlLabel
        control={<Checkbox size="small" checked={checked} onChange={(e) => onToggle(e.target.checked)} />}
        label="Each upload is one student"
      />
      {active && <p className={styles.fieldHint} role="status" aria-live="polite">{statusText}</p>}
    </>
  );
}
