import { useEffect, useState } from 'react';
import { Menu, X, Upload, FolderPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSidebarState } from '@/hooks/useSidebarState';
import { SidebarSection } from './SidebarSection';
import { SidebarMenuItem } from './SidebarMenuItem';
import { SidebarSearch } from './SidebarSearch';
import { SidebarStorageCard } from './SidebarStorageCard';
import { SidebarResizeHandle } from './SidebarResizeHandle';
import { SidebarFolderTree } from './SidebarFolderTree';
import { cn } from '@/lib/utils';
import type { Folder } from '@/types/knowledge';

interface ModernSidebarProps {
  folders: Folder[];
  selectedFolder: string | null;
  onFolderSelect: (folderId: string) => void;
  onCreateFolder: (parentId: string | null, name: string) => Promise<void>;
  onDeleteFolder: (folderId: string, force?: boolean) => Promise<void>;
  onRenameFolder?: (folderId: string, newName: string) => Promise<void>;
  onUpload?: () => void;
  onUpgrade?: () => void;
  storageUsed: number;
  storageTotal: number;
  className?: string;
  triggerRootFolderCreate?: boolean;
  onRequestInlineFolderCreate?: () => void;
}

export function ModernSidebar({
  folders,
  selectedFolder,
  onFolderSelect,
  onCreateFolder,
  onDeleteFolder,
  onRenameFolder,
  onUpload,
  onUpgrade,
  storageUsed,
  storageTotal,
  className,
  triggerRootFolderCreate,
  onRequestInlineFolderCreate,
}: ModernSidebarProps) {
  const {
    collapsed,
    width,
    sections,
    toggleCollapsed,
    toggleSection,
    updateWidth,
  } = useSidebarState();

  const [searchQuery, setSearchQuery] = useState('');

  // Keyboard shortcut for toggling sidebar (Cmd/Ctrl + B)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        toggleCollapsed();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleCollapsed]);

  const handleCreateRootFolder = () => {
    // Trigger inline folder creation
    if (onRequestInlineFolderCreate) {
      onRequestInlineFolderCreate();
    }
  };

  return (
    <aside
      data-sidebar
      className={cn(
        'relative h-full flex-shrink-0',
        'bg-sidebar text-sidebar-foreground',
        'border-r border-sidebar-border',
        'sidebar-enhanced',
        'transition-all duration-300 ease-out',
        className
      )}
      style={{
        width: collapsed ? '60px' : `${width}px`,
      }}
    >
      {/* Resize Handle - Only shown when not collapsed */}
      {!collapsed && (
        <SidebarResizeHandle onResize={updateWidth} minWidth={280} maxWidth={400} />
      )}

      {/* Sidebar Content */}
      <div className="h-full flex flex-col">
        {/* Header - Hidden when collapsed to maintain alignment */}
        {!collapsed && (
          <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
            <h2 className="text-sm font-bold text-sidebar-foreground uppercase tracking-wide">
              Memory
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleCollapsed}
              className={cn(
                'h-8 w-8 p-0',
                'hover:bg-sidebar-accent',
                'text-sidebar-icon hover:text-sidebar-foreground',
                'transition-colors duration-200'
              )}
              title="Collapse sidebar (⌘B)"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Scrollable Content */}
        <ScrollArea className="flex-1 sidebar-scroll">
          {collapsed ? (
            /* Collapsed State - Icon Only */
            <div className="py-4 space-y-2 flex flex-col items-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleCollapsed}
                className="h-10 w-10 p-0 hover:bg-sidebar-accent"
                title="Expand sidebar (⌘B)"
              >
                <Menu className="h-4 w-4 text-sidebar-icon" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onUpload}
                className="h-10 w-10 p-0 hover:bg-sidebar-accent"
                title="Upload"
              >
                <Upload className="h-4 w-4 text-sidebar-icon" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCreateRootFolder}
                className="h-10 w-10 p-0 hover:bg-sidebar-accent"
                title="New Folder"
              >
                <FolderPlus className="h-4 w-4 text-sidebar-icon" />
              </Button>
            </div>
          ) : (
            /* Expanded State - Full UI */
            <div className="py-2">
              {/* Search */}
              <SidebarSearch
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search folders..."
              />

              {/* Upload Action */}
              <div className="mb-3 px-3">
                <Button
                  onClick={onUpload}
                  className="w-full h-9 bg-sidebar-primary hover:bg-sidebar-primary/90 text-white transition-colors text-sm"
                >
                  <Upload className="h-4 w-4" />
                  <span className="ml-2">Upload</span>
                </Button>
              </div>

              {/* Storage Card */}
              <div className="my-4">
                <SidebarStorageCard
                  usedBytes={storageUsed}
                  totalBytes={storageTotal}
                  onUpgrade={onUpgrade}
                />
              </div>

              {/* Folders Section */}
              <SidebarSection
                title="FOLDERS"
                isExpanded={sections.folders}
                onToggle={() => toggleSection('folders')}
                collapsible={true}
                extraAction={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCreateRootFolder}
                    className="h-7 w-7 p-0 hover:bg-sidebar-accent text-sidebar-foreground rounded"
                    title="Create new folder"
                  >
                    <FolderPlus className="h-3 w-3" />
                  </Button>
                }
              >
                <SidebarFolderTree
                  folders={folders}
                  selectedFolder={selectedFolder}
                  onFolderSelect={onFolderSelect}
                  onCreateFolder={onCreateFolder}
                  onDeleteFolder={onDeleteFolder}
                  onRenameFolder={onRenameFolder}
                  searchQuery={searchQuery}
                  triggerRootFolderCreate={triggerRootFolderCreate}
                />
              </SidebarSection>
            </div>
          )}
        </ScrollArea>
      </div>
    </aside>
  );
}
