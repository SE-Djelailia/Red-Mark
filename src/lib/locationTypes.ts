// Single source of truth for location `type` display — labels and icons.
// Previously duplicated across LocationsTab, LocationDetail, and
// LocationsImportModal (each with its own hardcoded room/element map); kept
// here so adding a type only means updating one place.
import { MapPin, Home, Building2, TreePine, SquareParking, type LucideIcon } from "lucide-react";
import type { Location } from "./locationsApi";

export const LOCATION_TYPE_LABELS: Record<Location["type"], string> = {
  room: "Local",
  element: "Élément",
  roof: "Toiture",
  envelope: "Enveloppe",
  exterior: "Extérieur",
  parking: "Stationnement",
};

export const LOCATION_TYPE_ICONS: Record<Location["type"], LucideIcon> = {
  room: MapPin,
  element: MapPin,
  roof: Home,
  envelope: Building2,
  exterior: TreePine,
  parking: SquareParking,
};
