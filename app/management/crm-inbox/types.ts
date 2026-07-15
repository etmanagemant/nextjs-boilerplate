// CRM Inbox Type Definitions

export interface Fan {
  id: string;
  username: string;
  avatar_url?: string;
  total_revenue: number;
  is_vip: boolean;
  last_message_at: string;
  unread_count: number;
}

export interface ChatMessage {
  id: string;
  fan_id: string;
  sender: 'chatter' | 'fan';
  message_text: string;
  attached_media_id?: string;
  created_at: string;
  is_read: boolean;
}

export interface ChatterEmoji {
  id: string;
  chatter_id: string;
  emoji_list: string[];
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScriptLibrary {
  id: string;
  title: string;
  script_content: string;
  trigger_keyword?: string;
  category: 'greeting' | 'offer' | 'follow_up' | 'custom';
  is_global: boolean;
  assigned_to_user?: string;
  attached_media_id?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface VaultMedia {
  id: string;
  media_url: string;
  media_type: 'image' | 'video' | 'preview';
  preview_url?: string;
  created_at: string;
}

export interface FanMetadata {
  fan_id: string;
  notes: string;
  tags: string[];
  purchase_history: string;
  vip_tier?: string;
  last_interaction: string;
}

export interface InboxState {
  selectedFanId: string | null;
  messages: ChatMessage[];
  currentMessage: string;
  selectedScript: ScriptLibrary | null;
  attachedMediaId: string | null;
  isLoading: boolean;
  error: string | null;
}
