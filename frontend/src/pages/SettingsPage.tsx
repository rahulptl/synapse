import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Shield, Palette, Bell, Plug, FileDown, Lock } from 'lucide-react';
import { apiClient } from '@/services/apiClient';
import { useToast } from '@/hooks/use-toast';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { SettingsSidebar, SettingsSection as SettingsSectionType } from '@/components/settings/SettingsSidebar';
import { ProfileSection } from '@/components/settings/sections/ProfileSection';
import { ApiKeysSection } from '@/components/settings/sections/ApiKeysSection';
import { PlaceholderSection } from '@/components/settings/sections/PlaceholderSection';
import type { UserProfile, ProfileUpdateData } from '@/types/profile';

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  expires_at?: string;
  last_used_at?: string;
  is_active: boolean;
  created_at: string;
}

export default function SettingsPage() {
  const { user, loading, accessToken } = useAuth();
  const [activeSection, setActiveSection] = useState<SettingsSectionType>('profile');
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const { toast } = useToast();

  // Helper to get auth data for API calls
  const getAuthData = () => {
    if (!user || !accessToken) {
      throw new Error('User not authenticated');
    }
    return {
      userId: user.id,
      accessToken: accessToken,
    };
  };

  useEffect(() => {
    if (user) {
      loadApiKeys();
      loadUserProfile();
    }
  }, [user]);

  const loadApiKeys = async () => {
    try {
      const auth = getAuthData();
      const apiKeysData = await apiClient.getApiKeys(auth);
      setApiKeys(apiKeysData || []);
    } catch (error) {
      console.error('Failed to load API keys:', error);
      toast({
        title: "Error",
        description: "Failed to load API keys",
        variant: "destructive",
      });
    }
  };

  const loadUserProfile = async () => {
    try {
      const auth = getAuthData();
      const profile = await apiClient.getProfile(auth);
      setUserProfile(profile);
    } catch (error) {
      console.error('Failed to load profile:', error);
    }
  };

  const handleProfileUpdate = async (data: ProfileUpdateData) => {
    try {
      const auth = getAuthData();
      const result = await apiClient.updateProfile(data, auth);

      toast({
        title: "Profile Updated",
        description: "Your profile has been saved successfully!",
      });

      await loadUserProfile();
    } catch (error) {
      console.error('Profile update error:', error);

      if (error.message?.includes('authorization') || error.message?.includes('401')) {
        toast({
          title: "Authentication Error",
          description: "Your session has expired. Please log in again.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: `Failed to update profile: ${error.message}`,
          variant: "destructive",
        });
      }

      throw error;
    }
  };

  const createApiKey = async (name: string, expiryDate?: string) => {
    if (!user) return;

    try {
      const auth = getAuthData();

      let expiresInDays: number | undefined = undefined;
      if (expiryDate) {
        expiresInDays = Math.ceil((new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (expiresInDays > 365) {
          toast({
            title: "Invalid expiry date",
            description: "API keys can only be valid for up to 365 days",
            variant: "destructive",
          });
          return;
        }
        if (expiresInDays < 1) {
          toast({
            title: "Invalid expiry date",
            description: "Expiry date must be in the future",
            variant: "destructive",
          });
          return;
        }
      }

      const apiKeyData = {
        name: name.trim(),
        expires_in_days: expiresInDays
      };

      const response = await apiClient.createApiKey(apiKeyData, auth);
      setGeneratedKey(response.api_key);
      await loadApiKeys();

      toast({
        title: "Success",
        description: "API key created successfully",
      });
    } catch (error) {
      console.error('Failed to create API key:', error);
      toast({
        title: "Error",
        description: "Failed to create API key",
        variant: "destructive",
      });
    }
  };

  const deleteApiKey = async (keyId: string) => {
    try {
      const auth = getAuthData();
      await apiClient.deleteApiKey(keyId, auth);
      await loadApiKeys();

      toast({
        title: "Success",
        description: "API key deleted successfully",
      });
    } catch (error) {
      console.error('Failed to delete API key:', error);
      toast({
        title: "Error",
        description: "Failed to delete API key",
        variant: "destructive",
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "API key copied to clipboard",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const renderSection = () => {
    switch (activeSection) {
      case 'profile':
        return (
          <ProfileSection
            userProfile={userProfile}
            onProfileUpdate={handleProfileUpdate}
          />
        );
      case 'api-keys':
        return (
          <ApiKeysSection
            apiKeys={apiKeys}
            onCreateKey={createApiKey}
            onDeleteKey={deleteApiKey}
            onCopyKey={copyToClipboard}
            generatedKey={generatedKey}
            onClearGeneratedKey={() => setGeneratedKey(null)}
          />
        );
      case 'security':
        return (
          <PlaceholderSection
            title="Security"
            description="Manage your account security settings"
            icon={Shield}
          />
        );
      case 'appearance':
        return (
          <PlaceholderSection
            title="Appearance"
            description="Customize the look and feel of your workspace"
            icon={Palette}
          />
        );
      case 'notifications':
        return (
          <PlaceholderSection
            title="Notifications"
            description="Configure how you receive notifications"
            icon={Bell}
          />
        );
      case 'integrations':
        return (
          <PlaceholderSection
            title="Integrations"
            description="Connect with third-party services"
            icon={Plug}
          />
        );
      case 'data-export':
        return (
          <PlaceholderSection
            title="Data Export"
            description="Download your data and manage exports"
            icon={FileDown}
          />
        );
      case 'privacy':
        return (
          <PlaceholderSection
            title="Privacy Settings"
            description="Control your privacy and data sharing preferences"
            icon={Lock}
          />
        );
      default:
        return null;
    }
  };

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex min-h-screen w-full">
        <SettingsSidebar
          activeSection={activeSection}
          onSectionChange={setActiveSection}
        />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-6">
            <SidebarTrigger className="-ml-1" />
            <div className="flex-1" />
          </header>
          <main className="flex-1 p-6 md:p-8 max-w-5xl">
            {renderSection()}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
