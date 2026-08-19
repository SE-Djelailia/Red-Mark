// Activity-feed icon, monochrome per the design system.
//
// The previous treatment gave each activity kind a coloured chip
// (bg-subtle/bg-subtle/bg-subtle rounded squares). The design system
// reduces those to bare 16px icons in three semantic tints — the chips
// were the loudest remaining pre-refresh element on the Dashboard, and
// with four hues in play the colour carried no real meaning.
import { AlertCircle, CheckCircle, Calendar } from "lucide-react";
import type { ActivityEntry } from "../../../lib/supabaseApi";

const ICON: Record<ActivityEntry["kind"], typeof AlertCircle> = {
  issue_created: AlertCircle,
  issue_resolved: CheckCircle,
  visit_created: Calendar,
};

// Red for a new déficience, green for a resolved one, grey for everything
// procedural — matching the open/resolved semantic tokens.
const COLOR: Record<ActivityEntry["kind"], string> = {
  issue_created: "text-open",
  issue_resolved: "text-resolved",
  visit_created: "text-muted",
};

export default function ActivityIcon({ kind }: { kind: ActivityEntry["kind"] }) {
  const Icon = ICON[kind];
  return <Icon size={16} className={`${COLOR[kind]} flex-shrink-0`} aria-hidden="true" />;
}
