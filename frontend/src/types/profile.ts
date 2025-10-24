export interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  job_title?: string;
  company?: string;
  industry?: string;
  interests?: string[];
  communication_style?: 'formal' | 'casual' | 'technical';
  timezone?: string;
  primary_goals?: string[];
  use_cases?: string[];
  preferred_response_length?: 'brief' | 'medium' | 'detailed';
  topics_of_interest?: string[];
  avatar_url?: string;
  profile_completed: boolean;
  profile_completed_at?: string;
  created_at: string;
  updated_at: string;  // Used for avatar cache busting
}

export interface ProfileUpdateData {
  full_name?: string;
  job_title?: string;
  company?: string;
  industry?: string;
  interests?: string[];
  communication_style?: string;
  timezone?: string;
  primary_goals?: string[];
  use_cases?: string[];
  preferred_response_length?: string;
  topics_of_interest?: string[];
}

export interface AuthData {
  accessToken: string;
  refreshToken?: string;
  user: {
    id: string;
    email: string;
    full_name?: string;
    avatar_url?: string;
  };
}