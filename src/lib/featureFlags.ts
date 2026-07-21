// Simple compile-time feature flags. Flip a value here to re-enable a
// hidden feature — no other code changes needed, since every entry point
// gates on the flag rather than having its own on/off logic.

// Plans (PDF viewer + pin placement) is hidden in favor of the Locations
// feature for spatial tracking. All the code (PlanFileViewer,
// PlanFilesManager, LocationPinPanel, plansApi, the plan-files route, the
// underlying DB tables) is untouched and still fully functional — flipping
// this back to true re-enables every entry point at once. Possible future
// path: a Bluebeam API integration instead of the current PDF-pin flow.
export const PLANS_ENABLED = false;
