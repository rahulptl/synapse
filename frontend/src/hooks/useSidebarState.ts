import { useState, useEffect } from 'react';

interface SidebarSections {
  folders: boolean;
  quickActions: boolean;
}

interface SidebarState {
  collapsed: boolean;
  width: number;
  sections: SidebarSections;
}

const DEFAULT_STATE: SidebarState = {
  collapsed: false,
  width: 320,
  sections: {
    folders: true,
    quickActions: true,
  },
};

const STORAGE_KEYS = {
  collapsed: 'memory-sidebar-collapsed',
  width: 'memory-sidebar-width',
  sections: 'memory-sidebar-sections',
};

export function useSidebarState(prefix: string = 'memory') {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    const storageKey = `${prefix}-sidebar-collapsed`;
    const stored = localStorage.getItem(storageKey);
    return stored ? JSON.parse(stored) : DEFAULT_STATE.collapsed;
  });

  const [width, setWidth] = useState<number>(() => {
    const storageKey = `${prefix}-sidebar-width`;
    const stored = localStorage.getItem(storageKey);
    return stored ? parseInt(stored, 10) : DEFAULT_STATE.width;
  });

  const [sections, setSections] = useState<SidebarSections>(() => {
    const storageKey = `${prefix}-sidebar-sections`;
    const stored = localStorage.getItem(storageKey);
    return stored ? JSON.parse(stored) : DEFAULT_STATE.sections;
  });

  // Persist collapsed state
  useEffect(() => {
    const storageKey = `${prefix}-sidebar-collapsed`;
    localStorage.setItem(storageKey, JSON.stringify(collapsed));
  }, [collapsed, prefix]);

  // Persist width
  useEffect(() => {
    const storageKey = `${prefix}-sidebar-width`;
    localStorage.setItem(storageKey, width.toString());
  }, [width, prefix]);

  // Persist sections state
  useEffect(() => {
    const storageKey = `${prefix}-sidebar-sections`;
    localStorage.setItem(storageKey, JSON.stringify(sections));
  }, [sections, prefix]);

  const toggleCollapsed = () => setCollapsed((prev) => !prev);

  const toggleSection = (section: keyof SidebarSections) => {
    setSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const updateWidth = (newWidth: number) => {
    const clampedWidth = Math.max(280, Math.min(400, newWidth));
    setWidth(clampedWidth);
  };

  return {
    collapsed,
    width,
    sections,
    toggleCollapsed,
    toggleSection,
    updateWidth,
    setCollapsed,
  };
}
