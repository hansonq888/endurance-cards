import { Flame, Gauge, Layers, Timer, TrendingUp, Zap, type LucideIcon } from "lucide-react";
import type { AttributeKey } from "@/types/player";

/** One icon per stat, shared by the scout report and the guide. */
export const STAT_ICONS: Record<AttributeKey, LucideIcon> = {
  PAC: Gauge,
  END: Timer,
  PRS: TrendingUp,
  CONS: Flame,
  VAR: Layers,
  PHY: Zap,
};
