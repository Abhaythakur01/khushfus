"use client";

import React, { createContext, useContext, useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

interface TabsContextValue {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  registerTab: (value: string) => void;
  tabValues: React.MutableRefObject<string[]>;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("Tab components must be used within Tabs");
  return ctx;
}

interface TabsProps {
  defaultValue?: string;
  value?: string;
  children: React.ReactNode;
  className?: string;
  onChange?: (value: string) => void;
  onValueChange?: (value: string) => void;
}

function Tabs({ defaultValue, value, children, className, onChange, onValueChange }: TabsProps) {
  const [internalTab, setInternalTab] = useState(defaultValue ?? value ?? "");
  const activeTab = value ?? internalTab;
  const tabValues = useRef<string[]>([]);

  const setActiveTab = useCallback((tab: string) => {
    if (value === undefined) setInternalTab(tab);
    onChange?.(tab);
    onValueChange?.(tab);
  }, [value, onChange, onValueChange]);

  const registerTab = useCallback((val: string) => {
    if (!tabValues.current.includes(val)) {
      tabValues.current = [...tabValues.current, val];
    }
  }, []);

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab, registerTab, tabValues }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

interface TabListProps {
  children: React.ReactNode;
  className?: string;
}

function TabList({ children, className }: TabListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const { tabValues, setActiveTab } = useTabsContext();

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const tabs = tabValues.current;
      if (tabs.length === 0) return;

      const focusable = listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]');
      if (!focusable) return;

      const currentIndex = Array.from(focusable).findIndex(
        (el) => el === document.activeElement,
      );
      if (currentIndex === -1) return;

      let nextIndex = currentIndex;

      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        nextIndex = (currentIndex + 1) % focusable.length;
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        nextIndex = (currentIndex - 1 + focusable.length) % focusable.length;
      } else if (e.key === "Home") {
        e.preventDefault();
        nextIndex = 0;
      } else if (e.key === "End") {
        e.preventDefault();
        nextIndex = focusable.length - 1;
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const val = focusable[currentIndex]?.getAttribute("data-tab-value");
        if (val) setActiveTab(val);
        return;
      } else {
        return;
      }

      focusable[nextIndex]?.focus();
      const val = focusable[nextIndex]?.getAttribute("data-tab-value");
      if (val) setActiveTab(val);
    },
    [tabValues, setActiveTab],
  );

  return (
    <div
      ref={listRef}
      className={cn(
        "flex items-center gap-1 border-b border-white/[0.06] pb-px",
        className,
      )}
      role="tablist"
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  );
}

interface TabTriggerProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

function TabTrigger({ value, children, className }: TabTriggerProps) {
  const { activeTab, setActiveTab, registerTab } = useTabsContext();
  const isActive = activeTab === value;

  registerTab(value);

  return (
    <button
      role="tab"
      aria-selected={isActive}
      tabIndex={isActive ? 0 : -1}
      data-tab-value={value}
      onClick={() => setActiveTab(value)}
      className={cn(
        "px-4 py-2.5 text-sm font-medium transition-all duration-200 border-b-2 -mb-px rounded-t-md",
        isActive
          ? "text-indigo-400 border-indigo-500"
          : "text-slate-500 border-transparent hover:text-slate-300 hover:border-white/[0.1]",
        className,
      )}
    >
      {children}
    </button>
  );
}

interface TabPanelProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

function TabPanel({ value, children, className }: TabPanelProps) {
  const { activeTab } = useTabsContext();
  if (activeTab !== value) return null;

  return (
    <div role="tabpanel" tabIndex={0} className={cn("animate-fade-in pt-5", className)}>
      {children}
    </div>
  );
}

export { Tabs, TabList, TabTrigger, TabPanel };
export { TabList as TabsList, TabTrigger as TabsTrigger, TabPanel as TabsContent };
