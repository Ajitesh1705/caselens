import type { EntityType } from "@caselens/shared";

// The entity taxonomy — the app's signature visual language. Every place an
// entity appears (graph node, timeline dot, feed line, citation, side panel)
// reads from this single source so the whole console feels like one system.

export interface EntityStyle {
  color: string;
  glyph: string; // single-char mark rendered in nodes/chips
  label: string;
}

const STYLES: Record<EntityType, EntityStyle> = {
  person: { color: "#2f6fe0", glyph: "◆", label: "Person" },
  phone: { color: "#0e8c7f", glyph: "☎", label: "Phone" },
  account: { color: "#b4741a", glyph: "▤", label: "Account" },
  organization: { color: "#c23b3b", glyph: "⬢", label: "Organization" },
  email: { color: "#4e8a34", glyph: "✉", label: "Email" },
  location: { color: "#8a4ec0", glyph: "◈", label: "Location" },
  device: { color: "#5f6b78", glyph: "▣", label: "Device" },
};

const FALLBACK: EntityStyle = { color: "#5f6b78", glyph: "•", label: "Entity" };

export function entityStyle(type: string): EntityStyle {
  return STYLES[type as EntityType] ?? FALLBACK;
}

export const ENTITY_TYPES = Object.keys(STYLES) as EntityType[];
