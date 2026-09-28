import { Globe, Link2, Lock, type LucideIcon } from "lucide-react";
import type { Visibility } from "@/types/player";

/** Label, icon and one-line explanation for each card visibility; shared by the settings row and panel. */
export const VISIBILITY_OPTIONS: { value: Visibility; label: string; icon: LucideIcon; help: string }[] = [
  { value: "public", label: "Public", icon: Globe, help: "Anyone can find and view your card at your username." },
  { value: "unlisted", label: "Link only", icon: Link2, help: "Only people with your secret link can see it. Your username page shows “not found”." },
  { value: "private", label: "Private", icon: Lock, help: "Only you, when signed in. Sharing and embeds are turned off." },
];

export const visibilityOption = (v: Visibility) => VISIBILITY_OPTIONS.find((o) => o.value === v)!;
