import { Link2, Lock, type LucideIcon } from "lucide-react";
import type { Visibility } from "@/types/player";

/** Label, icon and one-line explanation for each card visibility; shared by the settings row and panel. */
export const VISIBILITY_OPTIONS: { value: Visibility; label: string; icon: LucideIcon; help: string }[] = [
  { value: "unlisted", label: "Link only", icon: Link2, help: "Anyone you send your link to sees your card, exactly as you see it." },
  { value: "private", label: "Private", icon: Lock, help: "Only you, when signed in. Your link and embeds stop working." },
];

export const visibilityOption = (v: Visibility) => VISIBILITY_OPTIONS.find((o) => o.value === v)!;
