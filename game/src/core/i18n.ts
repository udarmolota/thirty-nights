/**
 * Minimal i18n layer. ALL user-facing strings live in src/data/i18n/*.json;
 * game code refers to them by key only. Missing keys fall back to English,
 * then to the key itself (which makes gaps easy to spot on screen).
 */
import ru from '../data/i18n/ru.json'
import en from '../data/i18n/en.json'

export type Lang = 'ru' | 'en'

const DICTS: Record<Lang, Record<string, string>> = { ru, en }

let lang: Lang = 'ru'

export function setLang(l: Lang): void {
  lang = l
}

export function getLang(): Lang {
  return lang
}

export function t(key: string, params?: Record<string, string | number>): string {
  let s = DICTS[lang][key] ?? DICTS.en[key] ?? key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replaceAll(`{${k}}`, String(v))
    }
  }
  return s
}
