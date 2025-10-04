import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Copy, Eye, EyeOff, Key, Plus, Trash2, User } from 'lucide-react';
import { apiClient } from '@/services/apiClient';
import { useToast } from '@/hooks/use-toast';

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  expires_at?: string;
  last_used_at?: string;
  is_active: boolean;
  created_at: string;
}

interface Profile {
  id: string;
  full_name?: string;
  email: string;
  avatar_url?: string;
}

export default function SettingsPage() {
  const { user, loading, accessToken } = useAuth();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [fullName, setFullName] = useState('');
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyExpiry, setNewKeyExpiry] = useState('');
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [showGeneratedKey, setShowGeneratedKey] = useState(false);
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
      setFullName(user.full_name || '');
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

  const createApiKey = async () => {
    if (!user || !newKeyName.trim()) return;

    try {
      const auth = getAuthData();

      // Calculate expires_in_days and validate max 365 days
      let expiresInDays: number | undefined = undefined;
      if (newKeyExpiry) {
        expiresInDays = Math.ceil((new Date(newKeyExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
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
        name: newKeyName.trim(),
        expires_in_days: expiresInDays
      };

      const response = await apiClient.createApiKey(apiKeyData, auth);

      // Backend returns the full API key only on creation
      setGeneratedKey(response.api_key);
      setShowGeneratedKey(true);
      setNewKeyName('');
      setNewKeyExpiry('');
      setIsCreatingKey(false);
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

  // Note: Profile updates would need a backend endpoint
  // For now, we just update local state
  const updateProfile = (newFullName: string) => {
    setFullName(newFullName);
    // TODO: Call backend API to update profile
    toast({
      title: "Info",
      description: "Profile update not yet implemented",
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

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8">Settings</h1>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="api-keys">API Keys</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <User className="h-5 w-5 mr-2" />
                Profile Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  value={user.email || ''}
                  disabled
                  className="bg-muted"
                />
              </div>
              
              <div>
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  onBlur={(e) => updateProfile(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api-keys" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center">
                  <Key className="h-5 w-5 mr-2" />
                  API Keys
                </CardTitle>
                <Button
                  onClick={() => setIsCreatingKey(true)}
                  size="sm"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Key
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {isCreatingKey && (
                <Card className="bg-muted/30">
                  <CardContent className="p-4 space-y-4">
                    <div>
                      <Label htmlFor="keyName">Key Name</Label>
                      <Input
                        id="keyName"
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                        placeholder="e.g., Chrome Extension"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="keyExpiry">Expiry Date (Optional, max 365 days)</Label>
                      <Input
                        id="keyExpiry"
                        type="date"
                        value={newKeyExpiry}
                        onChange={(e) => setNewKeyExpiry(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                        max={new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                      />
                    </div>
                    
                    <div className="flex space-x-2">
                      <Button
                        onClick={createApiKey}
                        disabled={!newKeyName.trim()}
                        size="sm"
                      >
                        Create
                      </Button>
                      <Button
                        onClick={() => setIsCreatingKey(false)}
                        variant="outline"
                        size="sm"
                      >
                        Cancel
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {generatedKey && (
                <Card className="bg-green-500/10 border-green-500/20">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-green-700 dark:text-green-400">
                        New API Key Generated
                      </h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowGeneratedKey(!showGeneratedKey)}
                      >
                        {showGeneratedKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    <div className="flex items-center space-x-2">
                      <code className="flex-1 p-2 bg-background rounded text-sm">
                        {showGeneratedKey ? generatedKey : '•'.repeat(36)}
                      </code>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(generatedKey)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-sm text-green-600 dark:text-green-400 mt-2">
                      ⚠️ Save this key securely. You won't be able to see it again.
                    </p>
                  </CardContent>
                </Card>
              )}

              {apiKeys.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No API keys created yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {apiKeys.map((key) => (
                    <Card key={key.id}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              <h4 className="font-medium">{key.name}</h4>
                              <Badge variant={key.is_active ? "default" : "secondary"}>
                                {key.is_active ? "Active" : "Inactive"}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {key.key_prefix}
                            </p>
                            <div className="flex items-center space-x-4 mt-2 text-xs text-muted-foreground">
                              <span>Created: {new Date(key.created_at).toLocaleDateString()}</span>
                              {key.expires_at && (
                                <span>Expires: {new Date(key.expires_at).toLocaleDateString()}</span>
                              )}
                              {key.last_used_at && (
                                <span>Last used: {new Date(key.last_used_at).toLocaleDateString()}</span>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteApiKey(key.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}