import {
  runInstitutionDirectoryRequest,
  type InstitutionDirectoryRequestResult,
} from "@/lib/institution-directory-diagnostics";

type RequestOptions<T> = {
  startedAt: number;
  request: () => Promise<T>;
  setError: (message: string) => void;
  setBusy: (busy: boolean) => void;
  now?: () => number;
  shouldApplyUnavailable?: () => boolean;
  onUnavailable?: () => void;
};

const CLOSED_ERRORS = {
  load: "Could not load institutions. Try again.",
  refresh: "Could not refresh institutions. Your last saved rows are still shown; try again.",
  save: "Could not save that change. Your saved information is still available.",
  remove: "Could not remove that item. It is still available.",
} as const;

function runAction<T>(
  operation: "list" | "create-profile" | "update-profile" | "remove-profile" | "create-column" | "rename-column" | "remove-column" | "save-value" | "clear-value",
  target: "directory" | "profile" | "column" | "value",
  options: RequestOptions<T>,
  unavailableMessage: string,
): Promise<InstitutionDirectoryRequestResult<T>> {
  return runInstitutionDirectoryRequest({
    ...options,
    operation,
    target,
    onUnavailable: () => {
      if (options.shouldApplyUnavailable?.() === false) return;
      options.setError(unavailableMessage);
      options.setBusy(false);
      options.onUnavailable?.();
    },
  });
}

export function runInstitutionDirectoryList<T>(options: RequestOptions<T> & { isRefresh: boolean }) {
  return runAction("list", "directory", options, options.isRefresh ? CLOSED_ERRORS.refresh : CLOSED_ERRORS.load);
}

export function runInstitutionDirectoryCreateProfile<T>(options: RequestOptions<T>) {
  return runAction("create-profile", "profile", options, CLOSED_ERRORS.save);
}

export function runInstitutionDirectoryUpdateProfile<T>(options: RequestOptions<T>) {
  return runAction("update-profile", "profile", options, CLOSED_ERRORS.save);
}

export function runInstitutionDirectoryRemoveProfile<T>(options: RequestOptions<T>) {
  return runAction("remove-profile", "profile", options, CLOSED_ERRORS.remove);
}

export function runInstitutionDirectoryCreateColumn<T>(options: RequestOptions<T>) {
  return runAction("create-column", "column", options, CLOSED_ERRORS.save);
}

export function runInstitutionDirectoryRenameColumn<T>(options: RequestOptions<T>) {
  return runAction("rename-column", "column", options, CLOSED_ERRORS.save);
}

export function runInstitutionDirectoryRemoveColumn<T>(options: RequestOptions<T>) {
  return runAction("remove-column", "column", options, CLOSED_ERRORS.remove);
}

export function runInstitutionDirectorySaveValue<T>(options: RequestOptions<T>) {
  return runAction("save-value", "value", options, CLOSED_ERRORS.save);
}

export function runInstitutionDirectoryClearValue<T>(options: RequestOptions<T>) {
  return runAction("clear-value", "value", options, CLOSED_ERRORS.save);
}
