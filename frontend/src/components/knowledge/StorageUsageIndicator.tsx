import { useState, useEffect } from 'react';
import { apiClient } from '@/services/apiClient';
import { useAuth } from '@/hooks/useAuth';

interface StorageUsage {
  used_bytes: number;
  total_bytes: number;
  used_percentage: number;
  used_formatted: string;
  total_formatted: string;
}

export function StorageUsageIndicator() {
  const { user, accessToken } = useAuth();
  const [storage, setStorage] = useState<StorageUsage | null>(null);
  const [loading, setLoading] = useState(true);

  const STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024; // 1 GB

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const getProgressColor = (percentage: number): string => {
    if (percentage < 50) {
      // Slate to Blue gradient (0-50%) - subtle and professional
      const ratio = percentage / 50;
      const r = Math.round(148 * (1 - ratio) + 99 * ratio); // 148 to 99
      const g = Math.round(163 * (1 - ratio) + 102 * ratio); // 163 to 102
      const b = Math.round(184 * (1 - ratio) + 241 * ratio); // 184 to 241
      return `rgb(${r}, ${g}, ${b})`;
    } else if (percentage < 80) {
      // Blue to Amber gradient (50-80%) - warning colors
      const ratio = (percentage - 50) / 30;
      const r = Math.round(99 * (1 - ratio) + 245 * ratio); // 99 to 245
      const g = Math.round(102 * (1 - ratio) + 158 * ratio); // 102 to 158
      const b = Math.round(241 * (1 - ratio) + 11 * ratio); // 241 to 11
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      // Amber to Red gradient (80-100%) - critical colors
      const ratio = (percentage - 80) / 20;
      const r = Math.round(245 * (1 - ratio) + 239 * ratio); // 245 to 239
      const g = Math.round(158 * (1 - ratio) + 68 * ratio); // 158 to 68
      const b = Math.round(11 * (1 - ratio) + 68 * ratio); // 11 to 68
      return `rgb(${r}, ${g}, ${b})`;
    }
  };

  const getProgressBackground = (percentage: number): string => {
    const color = getProgressColor(percentage);
    return `linear-gradient(to right, ${color} ${percentage}%, rgba(255, 255, 255, 0.1) ${percentage}%)`;
  };

  const getStorageStatusText = (percentage: number): { text: string; color: string } => {
    if (percentage < 50) {
      return { text: 'Plenty of space', color: 'text-slate-300' };
    } else if (percentage < 80) {
      return { text: 'Getting full', color: 'text-blue-300' };
    } else if (percentage < 95) {
      return { text: 'Almost full', color: 'text-amber-400' };
    } else {
      return { text: 'Storage critical', color: 'text-red-400' };
    }
  };

  useEffect(() => {
    const fetchStorageUsage = async () => {
      if (!user || !accessToken) return;

      try {
        // For now, calculate storage locally since we don't have a dedicated endpoint
        // In the future, we can replace this with a backend call
        const auth = { userId: user.id, accessToken };

        try {
          // Try to get storage usage from backend (if available)
          const response = await apiClient.getUserStorageUsage(auth);
          setStorage({
            used_bytes: response.used_bytes,
            total_bytes: response.total_bytes,
            used_percentage: response.used_percentage,
            used_formatted: response.used_formatted,
            total_formatted: response.total_formatted
          });
        } catch (error) {
          // If backend endpoint doesn't exist, calculate from folder items
          console.log('Backend storage endpoint not available, calculating locally...');

          // Get all folders and their items to calculate storage
          const foldersResponse = await apiClient.getFolders(auth);
          let totalBytes = 0;

          const calculateFolderSize = async (folderId: string): Promise<number> => {
            try {
              const contentResponse = await apiClient.getFolderContent(folderId, auth);
              const items = contentResponse.items || [];

              return items.reduce((sum, item) => {
                // Add content size
                let itemSize = item.content ? item.content.length * 2 : 0; // Rough estimate (UTF-16)

                // Add file size if available
                if (item.size_bytes) {
                  itemSize += item.size_bytes;
                }

                return sum + itemSize;
              }, 0);
            } catch (error) {
              console.error(`Failed to calculate size for folder ${folderId}:`, error);
              return 0;
            }
          };

          // Calculate size for all folders
          const folders = foldersResponse.folders || [];
          const sizePromises = folders.map(folder => calculateFolderSize(folder.id));
          const sizes = await Promise.all(sizePromises);
          totalBytes = sizes.reduce((sum, size) => sum + size, 0);

          const usedPercentage = (totalBytes / STORAGE_LIMIT_BYTES) * 100;

          setStorage({
            used_bytes: totalBytes,
            total_bytes: STORAGE_LIMIT_BYTES,
            used_percentage: Math.min(usedPercentage, 100),
            used_formatted: formatBytes(totalBytes),
            total_formatted: formatBytes(STORAGE_LIMIT_BYTES)
          });
        }
      } catch (error) {
        console.error('Failed to fetch storage usage:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStorageUsage();
  }, [user, accessToken]);

  if (loading || !storage) {
    return (
      <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-3 animate-pulse">
        <div className="space-y-2">
          <div className="h-2 bg-white/10 rounded-full w-1/3"></div>
          <div className="h-2 bg-white/10 rounded-full"></div>
          <div className="h-2 bg-white/10 rounded-full w-3/4"></div>
        </div>
      </div>
    );
  }

  const statusInfo = getStorageStatusText(storage.used_percentage);
  const progressStyle = {
    background: getProgressBackground(storage.used_percentage),
  };

  return (
    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-4 hover:bg-white/8 transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-300">Storage Usage</span>
        <span className={`text-sm font-medium ${statusInfo.color}`}>
          {storage.used_formatted} / {storage.total_formatted}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="relative mb-3">
        <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${storage.used_percentage}%`,
              backgroundColor: getProgressColor(storage.used_percentage),
            }}
          />
        </div>
      </div>

      {/* Status Text */}
      <div className="flex items-center justify-between">
        <span className={`text-sm ${statusInfo.color} font-normal`}>
          {statusInfo.text}
        </span>
        <span className="text-sm text-gray-400 font-medium">
          {storage.used_percentage.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}