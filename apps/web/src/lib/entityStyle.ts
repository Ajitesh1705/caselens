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
  person: { color: "#6e9bf4", glyph: "◆", label: "Person" },
  phone: { color: "#3fbfa8", glyph: "☎", label: "Phone" },
  account: { color: "#e8a33d", glyph: "▤", label: "Account" },
  organization: { color: "#e06666", glyph: "⬢", label: "Organization" },
  email: { color: "#8dbf6a", glyph: "✉", label: "Email" },
  location: { color: "#b98be0", glyph: "◈", label: "Location" },
  device: { color: "#9aa6b2", glyph: "▣", label: "Device" },
};

const FALLBACK: EntityStyle = { color: "#9aa6b2", glyph: "•", label: "Entity" };

export function entityStyle(type: string): EntityStyle {
  return STYLES[type as EntityType] ?? FALLBACK;
}

export const ENTITY_TYPES = Object.keys(STYLES) as EntityType[];
