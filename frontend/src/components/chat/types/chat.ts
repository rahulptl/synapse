// Chat page types extracted from ChatPage.tsx

export interface Message {
  id: string;
  role: string;
  content: string;
  created_at: string;
  metadata?: {
    sources?: Array<{
      title: string;
      source: string;
      similarity: number;
    }>;
    context_items?: Array<{
      id: string;
      type: string;
      name: string;
    }>;
    generated_files?: Array<{
      id: string;
      filename: string;
      container_id: string;
      file_id: string;
      download_url: string;
      created_at: string;
      content_type?: string;
    }>;
  };
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatSource {
  title: string;
  source: string;
  similarity: number;
}

export interface HashtagInfo {
  detected_hashtags: string[];
  detected_file_refs?: string[];
  recognized_folders: Array<{ id: string; name: string }>;
  recognized_files?: Array<{
    id: string;
    title: string;
    folder_id?: string | null;
    reference: string;
    match_score: number;
    matched_field: string;
  }>;
  unrecognized_hashtags: string[];
  unrecognized_file_refs?: string[];
  folder_filtered: boolean;
  file_filtered?: boolean;
}

export interface UnifiedSuggestion {
  id: string;
  name: string;
  type: 'folder' | 'file';
  depth: number;
  match_score: number;
  content_type?: string;
  folder_id?: string;
  folder_name?: string;
  path?: string;
  has_children?: boolean;
}

export interface SelectedContextItem {
  id: string;
  name: string;
  type: 'folder' | 'file';
}

export interface ConversationDrafts {
  [key: string]: string;
}

export interface SelectedSource {
  title: string;
  source: string;
  similarity: number;
  content?: string;
  id?: string;
  fileMetadata?: Record<string, unknown>;
  contentType?: string;
}

// Re-export StatusType from existing component
export type { StatusType } from '@/components/chat/StatusTile';