export interface User {
  id: number;
  email: string;
  full_name: string;
  role: string;
  org_id: number;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: number;
  name: string;
  slug: string;
  plan: string;
  logo_url?: string;
  created_at: string;
  updated_at: string;
}

export interface OrgMember {
  id: number;
  user_id: number;
  org_id: number;
  role: "owner" | "admin" | "member" | "viewer";
  user: User;
  joined_at: string;
}

export interface Keyword {
  id: number;
  text: string;
  is_negative: boolean;
}

export interface Project {
  id: number;
  name: string;
  description?: string;
  org_id: number;
  keywords: Keyword[];
  platforms: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Mention {
  id: number;
  project_id: number;
  platform: "twitter" | "facebook" | "instagram" | "reddit" | "news" | "blog" | "youtube";
  source_url: string;
  author_name: string;
  author_handle?: string;
  author_avatar_url?: string;
  content: string;
  sentiment: "positive" | "negative" | "neutral";
  sentiment_score: number;
  reach: number;
  engagement: number;
  language: string;
  location?: string;
  published_at: string;
  collected_at: string;
}

export interface MentionList {
  items: Mention[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface Report {
  id: number;
  project_id: number;
  type: "daily" | "weekly" | "monthly" | "custom";
  title: string;
  status: "pending" | "generating" | "completed" | "failed";
  file_url?: string;
  generated_at?: string;
  created_at: string;
}

export interface AlertRule {
  id: number;
  project_id: number;
  name: string;
  condition_type: "spike" | "threshold" | "sentiment_drop" | "keyword";
  condition_value: Record<string, any>;
  channels: string[];
  is_active: boolean;
  created_at: string;
}

export interface AlertLog {
  id: number;
  alert_rule_id: number;
  rule: AlertRule;
  message: string;
  severity: "info" | "warning" | "critical";
  is_read: boolean;
  triggered_at: string;
}

export interface ScheduledPost {
  id: number;
  project_id: number;
  platform: string;
  content: string;
  media_urls: string[];
  scheduled_for: string;
  status: "draft" | "scheduled" | "published" | "failed";
  published_at?: string;
  created_at: string;
}

export interface DashboardMetrics {
  total_mentions: number;
  mentions_change: number;
  total_reach: number;
  reach_change: number;
  avg_sentiment: number;
  sentiment_change: number;
  total_engagement: number;
  engagement_change: number;
  mentions_over_time: { date: string; count: number }[];
  sentiment_distribution: { sentiment: string; count: number }[];
  platform_distribution: { platform: string; count: number }[];
  top_authors: { name: string; handle: string; mentions: number }[];
  recent_mentions: Mention[];
  trending_keywords: { keyword: string; count: number; change: number }[];
}

export interface SearchResult {
  mentions: Mention[];
  total: number;
  page: number;
  limit: number;
  facets: {
    platforms: { name: string; count: number }[];
    sentiments: { name: string; count: number }[];
  };
}

export interface ApiKey {
  id: number;
  name: string;
  prefix: string;
  key?: string; // only returned on creation
  scopes: string[];
  last_used_at?: string;
  expires_at?: string;
  created_at: string;
}

export interface ExportJob {
  id: number;
  project_id: number;
  format: "csv" | "xlsx" | "pdf";
  status: "pending" | "processing" | "completed" | "failed";
  file_url?: string;
  filters: Record<string, any>;
  created_at: string;
  completed_at?: string;
}
