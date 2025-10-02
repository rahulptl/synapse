import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, Play, Key, Database, MessageSquare, Search, Code2, Loader2, FileText, Settings } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";

export default function DocsPage() {
  const [isPlaygroundMode, setIsPlaygroundMode] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<any>(null);
  
  // Form states for different endpoints
  const [createFolderForm, setCreateFolderForm] = useState({
    name: "",
    description: "",
    parentId: ""
  });
  
  const [ingestForm, setIngestForm] = useState({
    title: "",
    content: "",
    folderId: "",
    contentType: "text",
    sourceUrl: "",
    metadata: "{}"
  });
  
  const [queryForm, setQueryForm] = useState({
    query: "",
    folderId: "",
    limit: "10",
    contentTypes: "text"
  });
  
  const [contentId, setContentId] = useState("");
  const [deleteForm, setDeleteForm] = useState({
    itemType: "content",
    itemId: ""
  });

  // Upload file state
  const [uploadApiKey, setUploadApiKey] = useState('');
  const [uploadFolderId, setUploadFolderId] = useState('');
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadResponse, setUploadResponse] = useState<any>(null);
  const [uploadLoading, setUploadLoading] = useState(false);

  const baseUrl = "https://euabvloqnbuxffrwmljk.supabase.co/functions/v1";

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const makeRequest = async (endpoint: string, method: string = "GET", body: any = null) => {
    if (!apiKey) {
      toast.error("Please enter your API key");
      return;
    }

    setLoading(true);
    setResponse(null);

    try {
      const headers: Record<string, string> = {
        "x-api-key": apiKey,
        "Content-Type": "application/json"
      };

      if (userId) {
        headers["x-user-id"] = userId;
      }

      const config: RequestInit = {
        method,
        headers
      };

      if (body && method !== "GET") {
        config.body = JSON.stringify(body);
      }

      const response = await fetch(`${baseUrl}${endpoint}`, config);
      const data = await response.json();
      
      setResponse({
        status: response.status,
        statusText: response.statusText,
        data
      });

      if (response.ok) {
        toast.success("Request successful!");
      } else {
        toast.error(`Request failed: ${response.status}`);
      }
    } catch (error) {
      toast.error("Network error occurred");
      setResponse({
        status: 0,
        statusText: "Network Error",
        data: { error: error instanceof Error ? error.message : "Unknown error" }
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUploadFile = async () => {
    if (!uploadApiKey || !uploadFolderId || !uploadTitle || !uploadFile) return;

    setUploadLoading(true);
    setUploadResponse(null);

    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('folder_id', uploadFolderId);
      formData.append('title', uploadTitle);
      if (uploadDescription) formData.append('description', uploadDescription);

      const response = await fetch('https://euabvloqnbuxffrwmljk.supabase.co/functions/v1/upload-file', {
        method: 'POST',
        headers: {
          'x-api-key': uploadApiKey,
        },
        body: formData,
      });

      const data = await response.json();
      setUploadResponse(data);
    } catch (error) {
      setUploadResponse({ error: 'Failed to upload file' });
    } finally {
      setUploadLoading(false);
    }
  };

  const generateCurlCommand = (endpoint: string, method: string = "GET", body: any = null) => {
    let command = `curl -X ${method}`;
    command += ` -H "x-api-key: ${apiKey || 'YOUR_API_KEY'}"`;
    if (userId) command += ` -H "x-user-id: ${userId}"`;
    if (body && method !== "GET") {
      command += ` -H "Content-Type: application/json"`;
      command += ` -d '${JSON.stringify(body, null, 2)}'`;
    }
    command += ` "${baseUrl}${endpoint}"`;
    return command;
  };

  const renderDocumentation = () => (
    <div className="space-y-8">
      {/* Introduction */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Knowledge API Documentation
          </CardTitle>
          <CardDescription>
            A RESTful API for managing your knowledge base with folders, content ingestion, and intelligent querying.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold mb-2">Base URL</h4>
            <code className="bg-muted px-3 py-1 rounded text-sm">
              https://euabvloqnbuxffrwmljk.supabase.co/functions/v1
            </code>
          </div>
          
          <div>
            <h4 className="font-semibold mb-2">Authentication</h4>
            <p className="text-sm text-muted-foreground mb-2">
              All endpoints require an API key in the request headers:
            </p>
            <code className="bg-muted px-3 py-1 rounded text-sm block">
              x-api-key: zyph_your_api_key_here
            </code>
          </div>
        </CardContent>
      </Card>

      {/* Endpoints */}
      <div className="grid gap-6">
        {/* Validate API Key */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-green-500" />
              Validate API Key
            </CardTitle>
            <CardDescription>Validate your API key and get user information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">POST</Badge>
              <code className="text-sm bg-muted px-2 py-1 rounded">/validate-api-key</code>
            </div>
            
            <div>
              <h5 className="font-medium mb-2">Response</h5>
              <pre className="bg-muted p-3 rounded text-sm overflow-x-auto">
{`{
  "success": true,
  "user_id": "user-uuid-here",
  "key_info": {
    "name": "API Key Name",
    "expires_at": "2024-12-31T23:59:59Z"
  }
}`}
              </pre>
            </div>
          </CardContent>
        </Card>

        {/* Get Folders */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-blue-500" />
              Get Folders
            </CardTitle>
            <CardDescription>Retrieve your folder hierarchy</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">GET</Badge>
              <code className="text-sm bg-muted px-2 py-1 rounded">/folders</code>
            </div>
            
            <div>
              <h5 className="font-medium mb-2">Response</h5>
              <pre className="bg-muted p-3 rounded text-sm overflow-x-auto">
{`{
  "success": true,
  "folders": [
    {
      "id": "folder-uuid",
      "name": "Personal",
      "description": "Personal knowledge",
      "path": "/personal",
      "depth": 0,
      "parent_id": null,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}`}
              </pre>
            </div>
          </CardContent>
        </Card>

        {/* Create Folder */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-green-500" />
              Create Folder
            </CardTitle>
            <CardDescription>Create a new folder in your hierarchy</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">POST</Badge>
              <code className="text-sm bg-muted px-2 py-1 rounded">/folders</code>
            </div>
            
            <div>
              <h5 className="font-medium mb-2">Request Body</h5>
              <pre className="bg-muted p-3 rounded text-sm overflow-x-auto">
{`{
  "name": "My New Folder",
  "description": "Optional description",
  "parent_id": "parent-folder-uuid" // optional
}`}
              </pre>
            </div>
            
            <div>
              <h5 className="font-medium mb-2">Response</h5>
              <pre className="bg-muted p-3 rounded text-sm overflow-x-auto">
{`{
  "success": true,
  "folder": {
    "id": "new-folder-uuid",
    "name": "My New Folder",
    "description": "Optional description",
    "path": "/my-new-folder",
    "depth": 0,
    "parent_id": null
  }
}`}
              </pre>
            </div>
          </CardContent>
        </Card>

        {/* Ingest Content */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-purple-500" />
              Ingest Content
            </CardTitle>
            <CardDescription>Add new knowledge to your database</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">POST</Badge>
              <code className="text-sm bg-muted px-2 py-1 rounded">/ingest-content</code>
            </div>
            
            <div>
              <h5 className="font-medium mb-2">Request Body</h5>
              <pre className="bg-muted p-3 rounded text-sm overflow-x-auto">
{`{
  "title": "Content Title",
  "content": "The actual content text",
  "folder_id": "folder-uuid",
  "content_type": "text", // text, document, image, video, audio
  "source_url": "https://example.com", // optional
  "metadata": {} // optional
}`}
              </pre>
            </div>
          </CardContent>
        </Card>

        {/* Query Content */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5 text-orange-500" />
              Query Content
            </CardTitle>
            <CardDescription>Search through your knowledge base</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">POST</Badge>
              <code className="text-sm bg-muted px-2 py-1 rounded">/query</code>
            </div>
            
            <div>
              <h5 className="font-medium mb-2">Request Body</h5>
              <pre className="bg-muted p-3 rounded text-sm overflow-x-auto">
{`{
  "query": "search terms",
  "folder_id": "folder-uuid", // optional
  "limit": 10, // optional, default 10
  "content_types": ["text", "document"] // optional
}`}
              </pre>
            </div>
          </CardContent>
        </Card>

        {/* Get Content */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-cyan-500" />
              Get Content
            </CardTitle>
            <CardDescription>Retrieve specific content by ID</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">GET</Badge>
              <code className="text-sm bg-muted px-2 py-1 rounded">/content/{'{'}content-id{'}'}</code>
            </div>
          </CardContent>
        </Card>

        {/* Upload File */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-indigo-500" />
              Upload File
            </CardTitle>
            <CardDescription>Upload files (images, PDFs, documents) to your knowledge base</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">POST</Badge>
              <code className="text-sm bg-muted px-2 py-1 rounded">/upload-file</code>
            </div>
            
            <div>
              <h5 className="font-medium mb-2">Request (multipart/form-data)</h5>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li><code>file</code>: File to upload (required)</li>
                <li><code>folder_id</code>: UUID of the target folder (required)</li>
                <li><code>title</code>: Title for the content (required)</li>
                <li><code>description</code>: Optional description</li>
              </ul>
            </div>
            
            <div>
              <h5 className="font-medium mb-2">Response</h5>
              <pre className="bg-muted p-3 rounded text-sm overflow-x-auto">
{`{
  "success": true,
  "content": {
    "id": "content-uuid",
    "title": "Uploaded Document",
    "content_type": "document",
    "file_url": "storage-url",
    "file_path": "path/to/file.pdf",
    "created_at": "2024-01-01T00:00:00Z"
  }
}`}
              </pre>
            </div>
          </CardContent>
        </Card>

        {/* Delete Item */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-red-500" />
              Delete Item
            </CardTitle>
            <CardDescription>Delete content or folders</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">DELETE</Badge>
              <code className="text-sm bg-muted px-2 py-1 rounded">/delete-item/{'{'}type{'}'}/{'{'}id{'}'}</code>
            </div>
            
            <div>
              <h5 className="font-medium mb-2">Parameters</h5>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li><code>type</code>: Either "content" or "folder"</li>
                <li><code>id</code>: UUID of the item to delete</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">
                {isPlaygroundMode ? "API Playground" : "API Documentation"}
              </h1>
              <p className="text-muted-foreground mt-2">
                {isPlaygroundMode 
                  ? "Test and explore our Knowledge API interactively"
                  : "Complete reference for the Knowledge API"
                }
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                <span className="text-sm">Docs</span>
                <Switch 
                  checked={isPlaygroundMode} 
                  onCheckedChange={setIsPlaygroundMode}
                />
                <span className="text-sm">Playground</span>
                <Settings className="h-4 w-4" />
              </div>
              <Badge variant="secondary" className="text-sm">v1.0</Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8 max-w-7xl">
        {isPlaygroundMode ? (
          <>
            {/* API Configuration */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  API Configuration
                </CardTitle>
                <CardDescription>
                  Enter your API credentials to start testing
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="apiKey">API Key (required)</Label>
                    <Input
                      id="apiKey"
                      type="password"
                      placeholder="zyph_..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="userId">User ID (optional)</Label>
                    <Input
                      id="userId"
                      placeholder="user-uuid-here"
                      value={userId}
                      onChange={(e) => setUserId(e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left Panel - API Testing */}
              <div className="space-y-6">
                <Tabs defaultValue="validate" className="w-full">
                  <TabsList className="grid w-full grid-cols-8">
                    <TabsTrigger value="validate">Validate</TabsTrigger>
                    <TabsTrigger value="folders">Folders</TabsTrigger>
                    <TabsTrigger value="create-folder">Create</TabsTrigger>
                    <TabsTrigger value="ingest">Ingest</TabsTrigger>
                    <TabsTrigger value="upload">Upload</TabsTrigger>
                    <TabsTrigger value="query">Query</TabsTrigger>
                    <TabsTrigger value="content">Content</TabsTrigger>
                    <TabsTrigger value="delete">Delete</TabsTrigger>
                  </TabsList>

                  {/* Validate API Key */}
                  <TabsContent value="validate">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Key className="h-5 w-5 text-green-500" />
                          Validate API Key
                        </CardTitle>
                        <CardDescription>
                          Test your API key and get user information
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">POST</Badge>
                          <code className="text-sm bg-muted px-2 py-1 rounded">/validate-api-key</code>
                        </div>
                        <Button 
                          onClick={() => makeRequest("/validate-api-key", "POST")}
                          disabled={loading}
                          className="w-full"
                        >
                          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                          Test Validation
                        </Button>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Get Folders */}
                  <TabsContent value="folders">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Database className="h-5 w-5 text-blue-500" />
                          Get Folders
                        </CardTitle>
                        <CardDescription>
                          Retrieve your folder hierarchy
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">GET</Badge>
                          <code className="text-sm bg-muted px-2 py-1 rounded">/folders</code>
                        </div>
                        <Button 
                          onClick={() => makeRequest("/folders")}
                          disabled={loading}
                          className="w-full"
                        >
                          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                          Get Folders
                        </Button>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Create Folder */}
                  <TabsContent value="create-folder">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Database className="h-5 w-5 text-green-500" />
                          Create Folder
                        </CardTitle>
                        <CardDescription>
                          Create a new folder in your hierarchy
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">POST</Badge>
                          <code className="text-sm bg-muted px-2 py-1 rounded">/folders</code>
                        </div>
                        
                        <div className="space-y-3">
                          <div>
                            <Label htmlFor="folderName">Folder Name</Label>
                            <Input
                              id="folderName"
                              placeholder="My New Folder"
                              value={createFolderForm.name}
                              onChange={(e) => setCreateFolderForm({...createFolderForm, name: e.target.value})}
                            />
                          </div>
                          
                          <div>
                            <Label htmlFor="folderDescription">Description (optional)</Label>
                            <Textarea
                              id="folderDescription"
                              placeholder="Folder description"
                              value={createFolderForm.description}
                              onChange={(e) => setCreateFolderForm({...createFolderForm, description: e.target.value})}
                              rows={2}
                            />
                          </div>
                          
                          <div>
                            <Label htmlFor="parentId">Parent Folder ID (optional)</Label>
                            <Input
                              id="parentId"
                              placeholder="parent-folder-uuid"
                              value={createFolderForm.parentId}
                              onChange={(e) => setCreateFolderForm({...createFolderForm, parentId: e.target.value})}
                            />
                          </div>
                        </div>
                        
                        <Button 
                          onClick={() => {
                            const body = {
                              name: createFolderForm.name,
                              description: createFolderForm.description || undefined,
                              parent_id: createFolderForm.parentId || undefined
                            };
                            makeRequest("/folders", "POST", body);
                          }}
                          disabled={loading || !createFolderForm.name}
                          className="w-full"
                        >
                          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                          Create Folder
                        </Button>
                      </CardContent>
                    </Card>
                  </TabsContent>
                  <TabsContent value="ingest">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Database className="h-5 w-5 text-purple-500" />
                          Ingest Content
                        </CardTitle>
                        <CardDescription>
                          Add new knowledge to your database
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">POST</Badge>
                          <code className="text-sm bg-muted px-2 py-1 rounded">/ingest-content</code>
                        </div>
                        
                        <div className="space-y-3">
                          <div>
                            <Label htmlFor="title">Title</Label>
                            <Input
                              id="title"
                              placeholder="Content title"
                              value={ingestForm.title}
                              onChange={(e) => setIngestForm({...ingestForm, title: e.target.value})}
                            />
                          </div>
                          
                          <div>
                            <Label htmlFor="content">Content</Label>
                            <Textarea
                              id="content"
                              placeholder="Content body"
                              value={ingestForm.content}
                              onChange={(e) => setIngestForm({...ingestForm, content: e.target.value})}
                              rows={3}
                            />
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label htmlFor="folderId">Folder ID</Label>
                              <Input
                                id="folderId"
                                placeholder="folder-uuid"
                                value={ingestForm.folderId}
                                onChange={(e) => setIngestForm({...ingestForm, folderId: e.target.value})}
                              />
                            </div>
                            
                            <div>
                              <Label htmlFor="contentType">Content Type</Label>
                              <Select value={ingestForm.contentType} onValueChange={(value) => setIngestForm({...ingestForm, contentType: value})}>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="text">Text</SelectItem>
                                  <SelectItem value="document">Document</SelectItem>
                                  <SelectItem value="image">Image</SelectItem>
                                  <SelectItem value="video">Video</SelectItem>
                                  <SelectItem value="audio">Audio</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          
                          <div>
                            <Label htmlFor="sourceUrl">Source URL (optional)</Label>
                            <Input
                              id="sourceUrl"
                              placeholder="https://example.com"
                              value={ingestForm.sourceUrl}
                              onChange={(e) => setIngestForm({...ingestForm, sourceUrl: e.target.value})}
                            />
                          </div>
                        </div>
                        
                        <Button 
                          onClick={() => {
                            const body = {
                              title: ingestForm.title,
                              content: ingestForm.content,
                              folder_id: ingestForm.folderId,
                              content_type: ingestForm.contentType,
                              source_url: ingestForm.sourceUrl || undefined,
                              metadata: {}
                            };
                            makeRequest("/ingest-content", "POST", body);
                          }}
                          disabled={loading || !ingestForm.title || !ingestForm.content || !ingestForm.folderId}
                          className="w-full"
                        >
                          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                          Ingest Content
                        </Button>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Upload File */}
                  <TabsContent value="upload">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Database className="h-5 w-5 text-blue-500" />
                          Upload File
                        </CardTitle>
                        <CardDescription>
                          Upload files to your knowledge base
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">POST</Badge>
                          <code className="text-sm bg-muted px-2 py-1 rounded">/upload-file</code>
                        </div>
                        
                        <div className="space-y-3">
                          <div>
                            <Label htmlFor="upload-api-key">API Key</Label>
                            <Input
                              id="upload-api-key"
                              type="password"
                              placeholder="Your API key"
                              value={uploadApiKey}
                              onChange={(e) => setUploadApiKey(e.target.value)}
                            />
                          </div>
                          
                          <div>
                            <Label htmlFor="upload-folder-id">Folder ID</Label>
                            <Input
                              id="upload-folder-id"
                              placeholder="folder-uuid"
                              value={uploadFolderId}
                              onChange={(e) => setUploadFolderId(e.target.value)}
                            />
                          </div>
                          
                          <div>
                            <Label htmlFor="upload-title">Title</Label>
                            <Input
                              id="upload-title"
                              placeholder="File title"
                              value={uploadTitle}
                              onChange={(e) => setUploadTitle(e.target.value)}
                            />
                          </div>
                          
                          <div>
                            <Label htmlFor="upload-file">File</Label>
                            <Input
                              id="upload-file"
                              type="file"
                              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                              accept=".pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.mp3,.wav,.m4a"
                            />
                          </div>
                          
                          <div>
                            <Label htmlFor="upload-description">Description (optional)</Label>
                            <Textarea
                              id="upload-description"
                              placeholder="Optional description"
                              value={uploadDescription}
                              onChange={(e) => setUploadDescription(e.target.value)}
                              rows={2}
                            />
                          </div>
                        </div>
                        
                        <Button 
                          onClick={handleUploadFile}
                          disabled={uploadLoading || !uploadApiKey || !uploadFolderId || !uploadTitle || !uploadFile}
                          className="w-full"
                        >
                          {uploadLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                          Upload File
                        </Button>
                        
                        {uploadResponse && (
                          <div className="mt-4 p-3 bg-muted rounded-lg">
                            <pre className="text-sm overflow-auto">{JSON.stringify(uploadResponse, null, 2)}</pre>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Query Content */}
                  <TabsContent value="query">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Search className="h-5 w-5 text-orange-500" />
                          Query Content
                        </CardTitle>
                        <CardDescription>
                          Search through your knowledge base
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">POST</Badge>
                          <code className="text-sm bg-muted px-2 py-1 rounded">/query</code>
                        </div>
                        
                        <div className="space-y-3">
                          <div>
                            <Label htmlFor="query">Search Query</Label>
                            <Input
                              id="query"
                              placeholder="What are you looking for?"
                              value={queryForm.query}
                              onChange={(e) => setQueryForm({...queryForm, query: e.target.value})}
                            />
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label htmlFor="queryFolderId">Folder ID (optional)</Label>
                              <Input
                                id="queryFolderId"
                                placeholder="folder-uuid"
                                value={queryForm.folderId}
                                onChange={(e) => setQueryForm({...queryForm, folderId: e.target.value})}
                              />
                            </div>
                            
                            <div>
                              <Label htmlFor="limit">Limit</Label>
                              <Input
                                id="limit"
                                type="number"
                                placeholder="10"
                                value={queryForm.limit}
                                onChange={(e) => setQueryForm({...queryForm, limit: e.target.value})}
                              />
                            </div>
                          </div>
                        </div>
                        
                        <Button 
                          onClick={() => {
                            const body = {
                              query: queryForm.query,
                              folder_id: queryForm.folderId || undefined,
                              limit: parseInt(queryForm.limit) || 10,
                              content_types: queryForm.contentTypes.split(',').map(t => t.trim()).filter(Boolean)
                            };
                            makeRequest("/query", "POST", body);
                          }}
                          disabled={loading || !queryForm.query}
                          className="w-full"
                        >
                          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                          Search
                        </Button>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Get Content */}
                  <TabsContent value="content">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <FileText className="h-5 w-5 text-cyan-500" />
                          Get Content
                        </CardTitle>
                        <CardDescription>
                          Retrieve specific content by ID
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">GET</Badge>
                          <code className="text-sm bg-muted px-2 py-1 rounded">/content/{'{content-id}'}</code>
                        </div>
                        
                        <div>
                          <Label htmlFor="contentId">Content ID</Label>
                          <Input
                            id="contentId"
                            placeholder="content-uuid"
                            value={contentId}
                            onChange={(e) => setContentId(e.target.value)}
                          />
                        </div>
                        
                        <Button 
                          onClick={() => makeRequest(`/content/${contentId}`)}
                          disabled={loading || !contentId}
                          className="w-full"
                        >
                          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                          Get Content
                        </Button>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Delete Item */}
                  <TabsContent value="delete">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Database className="h-5 w-5 text-red-500" />
                          Delete Item
                        </CardTitle>
                        <CardDescription>
                          Delete content or folders from your knowledge base
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">DELETE</Badge>
                          <code className="text-sm bg-muted px-2 py-1 rounded">/delete-item/{'{type}/{id}'}</code>
                        </div>
                        
                        <div className="space-y-3">
                          <div>
                            <Label htmlFor="itemType">Item Type</Label>
                            <Select value={deleteForm.itemType} onValueChange={(value) => setDeleteForm({...deleteForm, itemType: value})}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="content">Content</SelectItem>
                                <SelectItem value="folder">Folder</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          
                          <div>
                            <Label htmlFor="itemId">Item ID</Label>
                            <Input
                              id="itemId"
                              placeholder="item-uuid"
                              value={deleteForm.itemId}
                              onChange={(e) => setDeleteForm({...deleteForm, itemId: e.target.value})}
                            />
                          </div>
                        </div>
                        
                        <Button 
                          onClick={() => makeRequest(`/delete-item/${deleteForm.itemType}/${deleteForm.itemId}`, "DELETE")}
                          disabled={loading || !deleteForm.itemId}
                          variant="destructive"
                          className="w-full"
                        >
                          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                          Delete {deleteForm.itemType}
                        </Button>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </div>

              {/* Right Panel - Response and cURL */}
              <div className="space-y-6">
                {/* Response */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MessageSquare className="h-5 w-5" />
                      Response
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {response ? (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Badge variant={response.status >= 200 && response.status < 300 ? "default" : "destructive"}>
                            {response.status} {response.statusText}
                          </Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyToClipboard(JSON.stringify(response.data, null, 2), "Response")}
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            Copy
                          </Button>
                        </div>
                        <pre className="bg-muted p-4 rounded-md text-sm overflow-auto max-h-80">
                          {JSON.stringify(response.data, null, 2)}
                        </pre>
                      </div>
                    ) : (
                      <div className="text-center text-muted-foreground py-8">
                        Make a request to see the response here
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* cURL Command */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Code2 className="h-5 w-5" />
                      cURL Command
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const command = generateCurlCommand("/validate-api-key", "POST");
                          copyToClipboard(command, "cURL command");
                        }}
                        className="w-full"
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Copy Example cURL
                      </Button>
                      <pre className="bg-muted p-4 rounded-md text-sm overflow-auto">
                        {generateCurlCommand("/validate-api-key", "POST")}
                      </pre>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        ) : (
          renderDocumentation()
        )}
      </div>
    </div>
  );
}