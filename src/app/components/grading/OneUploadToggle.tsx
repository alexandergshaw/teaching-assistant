import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import TextField from "@mui/material/TextField";
import styles from "../../page.module.css";

type OneUploadToggleProps = {
  checked: boolean;
  onToggle: (next: boolean) => void;
  /** Shown (as a polite status) only while the mode is active. */
  statusText: string;
  active: boolean;
  /** Optional name for the next pick (N15a Wave 2); overrides the guessed one. */
  label: string;
  onLabelChange: (next: string) => void;
};

/** N15: the "each upload is one student" switch and its status line. */
export default function OneUploadToggle({ checked, onToggle, statusText, active, label, onLabelChange }: OneUploadToggleProps) {
  return (
    <>
      <FormControlLabel
        control={<Checkbox size="small" checked={checked} onChange={(e) => onToggle(e.target.checked)} />}
        label="Each upload is one student"
      />
      {active && (
        <TextField
          size="small"
          label="Student name (optional)"
          value={label}
          onChange={(e) => onLabelChange(e.target.value)}
          helperText="Used for the next file you pick. Leave blank to read the name from the file. Two uploads with the same name are numbered, never merged."
          slotProps={{ htmlInput: { maxLength: 120 } }}
        />
      )}
      {active && <p className={styles.fieldHint} role="status" aria-live="polite">{statusText}</p>}
    </>
  );
}
