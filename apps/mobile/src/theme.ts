import { Capacitor, SystemBars, SystemBarsStyle } from "@capacitor/core";
import type { ThemePreference } from "@gamepulse/ui";

export function toSystemBarsStyle(preference: ThemePreference): SystemBarsStyle {
  return {
    system: SystemBarsStyle.Default,
    light: SystemBarsStyle.Light,
    dark: SystemBarsStyle.Dark
  }[preference];
}

export async function syncMobileTheme(preference: ThemePreference): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    return;
  }
  await SystemBars.setStyle({ style: toSystemBarsStyle(preference) });
}
