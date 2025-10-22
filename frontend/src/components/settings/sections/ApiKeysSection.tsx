import { useState } from 'react';
import { Key, Plus, Copy, Eye, EyeOff, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  expires_at?: string;
  last_used_at?: string;
  is_active: boolean;
  created_at: string;
}

interface ApiKeysSectionProps {
  apiKeys: ApiKey[];
  onCreateKey: (name: string, expiryDate?: string) => Promise<void>;
  onDeleteKey: (keyId: string) => Promise<void>;
  onCopyKey: (key: string) => void;
  generatedKey: string | null;
  onClearGeneratedKey: () => void;
}

export function ApiKeysSection({
  apiKeys,
  onCreateKey,
  onDeleteKey,
  onCopyKey,
  generatedKey,
  onClearGeneratedKey,
}: ApiKeysSectionProps) {
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyExpiry, setNewKeyExpiry] = useState('');
  const [showGeneratedKey, setShowGeneratedKey] = useState(false);

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;

    await onCreateKey(newKeyName, newKeyExpiry);
    setNewKeyName('');
    setNewKeyExpiry('');
    setIsCreatingKey(false);
    setShowGeneratedKey(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground mb-2">API Keys</h2>
          <p className="text-muted-foreground">
            Manage your API keys for accessing the platform programmatically
          </p>
        </div>
        {apiKeys.length > 0 && (
          <Button onClick={() => setIsCreatingKey(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Key
          </Button>
        )}
      </div>

      <Card className="hover-lift">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Key className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Your API Keys</CardTitle>
              {apiKeys.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {apiKeys.length} {apiKeys.length === 1 ? 'key' : 'keys'} created
                </p>
              )}
            </div>
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
                  <Button onClick={handleCreateKey} disabled={!newKeyName.trim()} size="sm">
                    Create
                  </Button>
                  <Button onClick={() => setIsCreatingKey(false)} variant="outline" size="sm">
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
                  <Button variant="outline" size="sm" onClick={() => onCopyKey(generatedKey)}>
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
            <div className="text-center py-12">
              <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 mb-4">
                <Key className="h-10 w-10 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No API Keys Yet</h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Create your first API key to access the platform programmatically.
                Perfect for integrations, automation, and building custom applications.
              </p>
              <Button onClick={() => setIsCreatingKey(true)} size="lg">
                <Plus className="h-5 w-5 mr-2" />
                Create Your First API Key
              </Button>
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
                        <p className="text-sm text-muted-foreground">{key.key_prefix}</p>
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
                        onClick={() => onDeleteKey(key.id)}
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
    </div>
  );
}
