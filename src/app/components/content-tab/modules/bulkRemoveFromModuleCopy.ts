// B2 (docs/ux-audit-files-content.md): bulk "Remove from module" used to
// fire with no confirmation at all - one click destroyed every selected
// item's module placement, position, indent level and title override, no
// undo. Now two-click armed the same way "Delete from Canvas" already is
// (confirmArming.ts), with its own label + banner text pulled out as pure
// functions so BulkItemsSection.tsx's JSX has no inline copy to drift, and
// so the exact wording is directly testable with frozen literals.
export function bulkRemoveFromModuleButtonLabel(confirmArmed: boolean): string {
  return confirmArmed ? "Confirm remove" : "Remove";
}

// Named the way the audit's own fix description reads: say what is lost
// (placement, position, indent, title override), not just "N items".
export function bulkRemoveFromModuleBannerText(itemCount: number): string {
  const plural = itemCount !== 1;
  const items = plural ? "items" : "item";
  const its = plural ? "their" : "its";
  const modules = plural ? "their modules" : "its module";
  return (
    `Click "Confirm remove" again to remove the selected ${items} from ${modules} — ` +
    `this drops ${its} placement, position, indent, and any title override. ` +
    `The ${items} stay in Canvas; module placement is not restored automatically.`
  );
}
