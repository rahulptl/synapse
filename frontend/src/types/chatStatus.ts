export type ChatStatus = {
  type:
    | 'starting'
    | 'web_search'
    | 'file_search'
    | 'code_interpreter'
    | 'generating'
    | 'complete'
    | null;
  message?: string;
  details?: string;
  timestamp: number;
};

export interface ChatStatusHistory {
  current: ChatStatus | null;
  history: ChatStatus[];
}