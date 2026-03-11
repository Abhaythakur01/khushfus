import en from "./en";

export type LocaleCode = "en";

export interface LocaleDefinition {
  code: LocaleCode;
  name: string;
  translations: Record<string, string>;
}

const locales: Record<LocaleCode, LocaleDefinition> = {
  en: {
    code: "en",
    name: "English",
    translations: en,
  },
};

export const defaultLocale: LocaleCode = "en";

export const availableLocales = Object.values(locales).map(({ code, name }) => ({ code, name }));

export function getTranslations(locale: LocaleCode): Record<string, string> {
  return locales[locale]?.translations ?? locales[defaultLocale].translations;
}

export default locales;
