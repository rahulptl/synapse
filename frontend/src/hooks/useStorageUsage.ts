import { useState, useEffect } from 'react';
import { apiClient } from '@/services/apiClient';
import { useAuth } from '@/hooks/useAuth';

interface StorageUsage {
  used_bytes: number;
  total_bytes: number;
  used_percentage: number;
}

const STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024; // 1 GB default

export function useStorageUsage() {
  const { user, accessToken } = useAuth();
  const [storage, setStorage] = useState<StorageUsage>({
    used_bytes: 0,
    total_bytes: STORAGE_LIMIT_BYTES,
    used_percentage: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStorageUsage = async () => {
      if (!user || !accessToken) return;

      try {
        const auth = { userId: user.id, accessToken };

        try {
          // Try to get storage usage from backend
          const response = await apiClient.getUserStorageUsage(auth);
          setStorage({
            used_bytes: response.used_bytes,
            total_bytes: response.total_bytes,
            used_percentage: response.used_percentage,
          });
        } catch (error) {
          // If backend endpoint doesn't exist, calculate locally
          console.log('Backend storage endpoint not available, calculating locally...');

          const foldersResponse = await apiClient.getFolders(auth);
          let totalBytes = 0;

          const calculateFolderSize = async (folderId: string): Promise<number> => {
            try {
              const contentResponse = await apiClient.getFolderContent(folderId, auth);
              const items = contentResponse.items || [];

              return items.reduce((sum, item) => {
                let itemSize = item.content ? item.content.length * 2 : 0;
                if (item.size_bytes) {
                  itemSize += item.size_bytes;
                }
                return sum + itemSize;
              }, 0);
            } catch (error) {
              return 0;
            }
          };

          const folders = foldersResponse.folders || [];
          const sizePromises = folders.map(folder => calculateFolderSize(folder.id));
          const sizes = await Promise.all(sizePromises);
          totalBytes = sizes.reduce((sum, size) => sum + size, 0);

          const usedPercentage = (totalBytes / STORAGE_LIMIT_BYTES) * 100;

          setStorage({
            used_bytes: totalBytes,
            total_bytes: STORAGE_LIMIT_BYTES,
            used_percentage: Math.min(usedPercentage, 100),
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

  return { storage, loading };
}
