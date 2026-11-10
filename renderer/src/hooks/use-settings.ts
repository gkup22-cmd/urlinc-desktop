import { useState, useEffect } from "react";

export interface AppSettings {
  autoFullscreen: boolean;
  defaultCategoryNewlyAdded: boolean;
  findSimilarItems: boolean;
  chatCaptionTimeout: number; // seconds before captions fade out; 0 = never show captions
  dictationLang: string;       // BCP-47 language code for speech-to-text dictation
  showDictationControls: boolean; // whether the language selector is shown in the chat bar
  findSimilarVideos: boolean;  // whether to show "Find Similar Videos" on video pages
  chatMode: "language-badge" | "trivia"; // dual-purpose chat settings toggle
}

const DEFAULTS: AppSettings = {
  autoFullscreen: false,
  defaultCategoryNewlyAdded: false,
  findSimilarItems: true,
  chatCaptionTimeout: 5,
  dictationLang: "en-US",
  showDictationControls: true,
  findSimilarVideos: true,
  chatMode: "language-badge",
};

const KEY = "vvm_settings";

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) } as AppSettings;
  } catch {
    return { ...DEFAULTS };
  }
}

function save(settings: AppSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {}
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(load);

  useEffect(() => {
    save(settings);
  }, [settings]);

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return { settings, update };
}
