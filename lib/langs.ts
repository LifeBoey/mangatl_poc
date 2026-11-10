// Languages we can machine-translate into English (MangaDex language codes).
export const SOURCE_LANGS = ["ja", "es", "es-la", "pt", "pt-br"] as const;

export const LANG_NAMES: Record<string, string> = {
  en: "English",
  ja: "Japanese",
  es: "Spanish",
  "es-la": "Spanish (LatAm)",
  pt: "Portuguese",
  "pt-br": "Portuguese (BR)",
};

export const langName = (code: string) => LANG_NAMES[code] ?? code;
