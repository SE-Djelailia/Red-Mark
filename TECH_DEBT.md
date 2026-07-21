# Tech debt

- **RESOLVED — Photo↔issue linking is now a real relationship.** `photos.issue_id` (FK → `issues.id`,
  `ON DELETE SET NULL`, mirroring the existing `photos.location_id` pattern) replaced the old JSONB
  `photos: {id, url}[]` array that used to live in `issues.location`. `stage-issue-consolidation.sql`
  migrated existing data (sandbox-tested, zero loss) and both `dev-schema.sql`/`prod-schema.sql` have the
  column/index/FK. `issuesApi.ts` reads an issue's photos via a real batched query (`attachPhotos`) instead
  of JSONB, and every create/edit surface (`IssueForm.tsx`, the pin quick-create in `LocationPinPanel.tsx`)
  attaches via `photos.issue_id` through the shared `uploadIssuePhotos` helper — including the offline
  upload queue path, which previously could never link a queued photo back to its issue once flushed.

- **Remaining minor cleanup: `issues.photo_id` (singular) is dead.** A leftover column from before the
  `photos.issue_id` relationship existed — no code reads or writes it (the real relationship is the reverse
  FK on `photos`, not this one). Safe to drop in a future migration; left alone for now since removing it
  isn't required for anything currently planned.
