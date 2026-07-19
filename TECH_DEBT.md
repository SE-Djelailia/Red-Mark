# Tech debt

- **Photo↔issue linking is a JSONB array, not a real relationship.** `issues.location` (JSONB) holds a
  `photos: {id, url}[]` array (see `issuesApi.ts`'s `IssueExtras`/`buildExtras`), rather than the `photos`
  table having an `issue_id` FK. The `photos` table has no `issue_id` column at all today. This means:
  - Nothing enforces that a referenced photo still exists, or prevents duplicate/stale entries.
  - The offline upload queue (`uploadQueue.ts`) can't link a photo to its issue once it flushes — a photo
    that fails to upload live (e.g. from the pin quick-create flow in `LocationPinPanel.tsx`) gets queued
    with `visit_id`/`location_id` only; it uploads into the `photos` table correctly once back online, but
    never gets pushed into the originating issue's JSONB `photos` array. The user sees a toast explaining
    this at capture time, but nothing fixes it up automatically later.
  - Refactoring to a proper `photos.issue_id` FK (and reading an issue's photos via a real join instead of
    JSONB) would fix this gap as a side effect, plus make photo/issue integrity DB-enforced. Not planned
    now — just tracked.
