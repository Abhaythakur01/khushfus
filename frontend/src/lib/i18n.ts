"use client";

import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { type LocaleCode, defaultLocale, getTranslations } from "./locales";

const LOCALE_STORAGE_KEY = "khushfus_locale";

function detectLocale(): LocaleCode {
  if (typeof window === "undefined") return defaultLocale;

  const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored && isValidLocale(stored)) return stored;

  const browserLang = navigator.language?.split("-")[0];
  if (browserLang && isValidLocale(browserLang)) return browserLang;

  return defaultLocale;
}

function isValidLocale(code: string): code is LocaleCode {
  try {
    const translations = getTranslations(code as LocaleCode);
    return Object.keys(translations).length > 0;
  } catch {
    return false;
  }
}

function interpolate(template: string, params?: Record<string, string>): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => params[key] ?? `{{${key}}}`);
}

interface I18nContextValue {
  locale: LocaleCode;
  setLocale: (locale: LocaleCode) => void;
  t: (key: string, params?: Record<string, string>) => string;
}

export const I18nContext = createContext<I18nContextValue | null>(null);

export function useTranslation() {
  const ctx = useContext(I18nContext);

  // Standalone usage (without provider) — fallback to local state
  const [locale, setLocaleState] = useState<LocaleCode>(defaultLocale);
  const [translations, setTranslations] = useState<Record<string, string>>(() =>
    getTranslations(defaultLocale),
  );

  useEffect(() => {
    if (ctx) return; // Provider handles everything
    const detected = detectLocale();
    setLocaleState(detected);
    setTranslations(getTranslations(detected));
  }, [ctx]);

  const setLocaleFallback = useCallback((newLocale: LocaleCode) => {
    setLocaleState(newLocale);
    setTranslations(getTranslations(newLocale));
    localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
  }, []);

  const tFallback = useCallback(
    (key: string, params?: Record<string, string>): string => {
      const template = translations[key];
      if (!template) return key;
      return interpolate(template, params);
    },
    [translations],
  );

  if (ctx) {
    return { locale: ctx.locale, setLocale: ctx.setLocale, t: ctx.t };
  }

  return { locale, setLocale: setLocaleFallback, t: tFallback };
}

// Helper to create context value (for use in a provider component)
export function useI18nProvider(): I18nContextValue {
  const [locale, setLocaleState] = useState<LocaleCode>(defaultLocale);
  const [translations, setTranslations] = useState<Record<string, string>>(() =>
    getTranslations(defaultLocale),
  );

  useEffect(() => {
    const detected = detectLocale();
    setLocaleState(detected);
    setTranslations(getTranslations(detected));
  }, []);

  const setLocale = useCallback((newLocale: LocaleCode) => {
    setLocaleState(newLocale);
    setTranslations(getTranslations(newLocale));
    localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string>): string => {
      const template = translations[key];
      if (!template) return key;
      return interpolate(template, params);
    },
    [translations],
  );

  return { locale, setLocale, t };
}
