/**
 * Types for the knowledge base system
 * Supports both file uploads and text entries
 */

// File metadata returned with knowledge items
export interface KnowledgeItemMetadata extends Record<string, unknown> {
  download_url?: string;
  has_file?: boolean;
  original_filename?: string;
  mime_type?: string;
  stored_in_storage?: boolean;
  file_size?: number;
  fileStored?: string;
}

// Base knowledge item interface
export interface KnowledgeItem {
  id: string;
  user_id: string;
  folder_id: string;
  title: string;
  description?: string;
  content: string;
  content_type?: string;
  source_type: 'upload' | 'text' | 'ingest';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  filename?: string | null;  // NULL for text entries
  size_bytes?: number | null;  // NULL for text entries
  tags?: string[] | null;
  metadata?: KnowledgeItemMetadata | null;
  created_at: string;
  updated_at: string;
  is_searchable?: boolean;
  openai_info?: {
    indexed: boolean;
    status: string;
    vector_store_id?: string | null;
    openai_file_id?: string | null;
  };
  storage_info?: {
    gcs_url?: string | null;
    stored_in_storage?: boolean;
  };
}

// Text entry specific interface
export interface TextEntry {
  title: string;
  content: string;
  folder_id: string;
  description?: string;
  tags?: string[];
  metadata?: KnowledgeItemMetadata;
}

// File upload specific interface
export interface FileUpload {
  title: string;
  description?: string;
  folder_id: string;
  file: File;
}

// Folder interface
export interface Folder {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  parent_id?: string | null;
  path: string;
  depth: number;
  created_at: string;
  updated_at: string;
  children?: Folder[];
}

// API response types
export interface KnowledgeItemResponse {
  success: boolean;
  message: string;
  item: KnowledgeItem;
}

export interface TextEntryResponse {
  success: boolean;
  message: string;
  item: KnowledgeItem;
}

export interface FolderContentResponse {
  folder: {
    id: string;
    name: string;
  };
  items: KnowledgeItem[];
}

// Search and filter types
export type SourceTypeFilter = 'all' | 'upload' | 'text';
export type StatusFilter = 'all' | 'pending' | 'processing' | 'completed' | 'failed';

export interface KnowledgeItemFilters {
  source_type?: SourceTypeFilter;
  status?: StatusFilter;
  folder_id?: string;
  search_query?: string;
}

// UI state types
export interface KnowledgeItemState {
  items: KnowledgeItem[];
  folders: Folder[];
  current_folder: Folder | null;
  filters: KnowledgeItemFilters;
  loading: boolean;
  error: string | null;
}

// Upload progress types
export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
  status: 'uploading' | 'processing' | 'completed' | 'error';
  error?: string;
}

// Legacy compatibility (for existing code that hasn't been migrated yet)
export interface LegacyKnowledgeItem {
  id: string;
  user_id: string;
  folder_id: string;
  title: string;
  content: string;
  content_type: string;
  source_url?: string;
  processing_status: string;
  is_chunked: boolean;
  total_chunks: number;
  chunks_processed: number;
  processing_progress: number;
  created_at: string;
  updated_at: string;
  metadata?: KnowledgeItemMetadata;
}
