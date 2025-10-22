import { useState, useEffect } from 'react';
import { ChevronDown, User, Key, Shield, Palette, Bell, Plug, FileDown, Lock, Settings as SettingsIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';

export type SettingsSection =
  | 'profile'
  | 'api-keys'
  | 'security'
  | 'appearance'
  | 'notifications'
  | 'integrations'
  | 'data-export'
  | 'privacy';

interface SettingsSidebarProps {
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
}

interface SidebarMenuItem {
  id: SettingsSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface SidebarGroup {
  id: string;
  label: string;
  items: SidebarMenuItem[];
  defaultExpanded?: boolean;
}

const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    id: 'account',
    label: 'ACCOUNT',
    defaultExpanded: true,
    items: [
      { id: 'profile', label: 'Profile', icon: User },
      { id: 'security', label: 'Security', icon: Shield },
      { id: 'api-keys', label: 'API Keys', icon: Key },
    ],
  },
  {
    id: 'data-privacy',
    label: 'DATA & PRIVACY',
    defaultExpanded: true,
    items: [
      { id: 'data-export', label: 'Data Export', icon: FileDown },
      { id: 'privacy', label: 'Privacy Settings', icon: Lock },
    ],
  },
  {
    id: 'customization',
    label: 'CUSTOMIZATION',
    defaultExpanded: true,
    items: [
      { id: 'appearance', label: 'Appearance', icon: Palette },
      { id: 'notifications', label: 'Notifications', icon: Bell },
      { id: 'integrations', label: 'Integrations', icon: Plug },
    ],
  },
];

const STORAGE_KEY = 'settings-sidebar-collapsed-sections';

export function SettingsSidebar({ activeSection, onSectionChange }: SettingsSidebarProps) {
  // Load collapsed state from localStorage
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Persist collapsed state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...collapsedSections]));
    } catch (error) {
      console.error('Failed to save sidebar state:', error);
    }
  }, [collapsedSections]);

  const toggleSection = (sectionId: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  const isSectionExpanded = (sectionId: string) => {
    return !collapsedSections.has(sectionId);
  };

  return (
    <Sidebar className="sidebar-enhanced border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sidebar-primary to-purple-600">
            <SettingsIcon className="h-5 w-5 text-white" />
          </div>
          <h2 className="text-lg font-semibold text-sidebar-foreground">Settings</h2>
        </div>
      </SidebarHeader>

      <SidebarContent className="sidebar-scroll px-3 py-4">
        {SIDEBAR_GROUPS.map((group, groupIndex) => {
          const isExpanded = isSectionExpanded(group.id);

          return (
            <SidebarGroup key={group.id} className="mb-6">
              <button
                onClick={() => toggleSection(group.id)}
                className="flex w-full items-center justify-between px-3 py-2 transition-colors hover:bg-sidebar-accent/30 rounded-md"
              >
                <SidebarGroupLabel className="sidebar-section-header m-0">
                  {group.label}
                </SidebarGroupLabel>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-sidebar-muted transition-transform duration-200",
                    isExpanded ? "rotate-180" : ""
                  )}
                />
              </button>

              {isExpanded && (
                <SidebarGroupContent className="relative mt-2">
                  {/* Vertical connector line */}
                  {group.items.length > 1 && (
                    <div className="sidebar-connector-line" />
                  )}

                  <SidebarMenu>
                    {group.items.map((item, itemIndex) => {
                      const Icon = item.icon;
                      const isActive = activeSection === item.id;
                      const isLastItem = itemIndex === group.items.length - 1;

                      return (
                        <SidebarMenuItem key={item.id} className="relative">
                          <SidebarMenuButton
                            onClick={() => onSectionChange(item.id)}
                            isActive={isActive}
                            className={cn(
                              "sidebar-menu-item-hover",
                              "h-10 gap-3 rounded-lg px-3",
                              isActive && "sidebar-menu-item-active font-medium"
                            )}
                          >
                            <Icon className={cn(
                              "h-5 w-5",
                              isActive ? "text-sidebar-primary-foreground" : "text-sidebar-icon"
                            )} />
                            <span className={cn(
                              "text-sm",
                              isActive ? "text-sidebar-primary-foreground" : "text-sidebar-foreground"
                            )}>
                              {item.label}
                            </span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              )}
            </SidebarGroup>
          );
        })}
      </SidebarContent>
    </Sidebar>
  );
}
