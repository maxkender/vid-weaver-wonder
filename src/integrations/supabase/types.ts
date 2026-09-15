export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      api_clients: {
        Row: {
          active: boolean
          created_at: string
          daily_quota: number
          id: string
          key_hash: string
          name: string
          webhook_secret: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          daily_quota?: number
          id?: string
          key_hash: string
          name: string
          webhook_secret: string
        }
        Update: {
          active?: boolean
          created_at?: string
          daily_quota?: number
          id?: string
          key_hash?: string
          name?: string
          webhook_secret?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: number
          payload: Json | null
          target_id: string | null
          target_table: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: number
          payload?: Json | null
          target_id?: string | null
          target_table?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: number
          payload?: Json | null
          target_id?: string | null
          target_table?: string | null
        }
        Relationships: []
      }
      contract_templates: {
        Row: {
          body: string
          created_at: string
          id: string
          is_active: boolean
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_active?: boolean
          title: string
          updated_at?: string
          version: number
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_active?: boolean
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      contracts: {
        Row: {
          body: string
          id: string
          poster_id: string
          signed_at: string
          signed_full_name: string
          signed_ip: string | null
          signed_user_agent: string | null
          version: number
        }
        Insert: {
          body: string
          id?: string
          poster_id: string
          signed_at?: string
          signed_full_name: string
          signed_ip?: string | null
          signed_user_agent?: string | null
          version: number
        }
        Update: {
          body?: string
          id?: string
          poster_id?: string
          signed_at?: string
          signed_full_name?: string
          signed_ip?: string | null
          signed_user_agent?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "contracts_poster_id_fkey"
            columns: ["poster_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_videos: {
        Row: {
          caption: string
          created_at: string
          duration_sec: number
          hashtags: string[]
          id: string
          language: string
          publish_date: string
          render_id: string | null
          status: string
          storage_path: string | null
          title: string
          updated_at: string
        }
        Insert: {
          caption?: string
          created_at?: string
          duration_sec?: number
          hashtags?: string[]
          id?: string
          language: string
          publish_date: string
          render_id?: string | null
          status?: string
          storage_path?: string | null
          title?: string
          updated_at?: string
        }
        Update: {
          caption?: string
          created_at?: string
          duration_sec?: number
          hashtags?: string[]
          id?: string
          language?: string
          publish_date?: string
          render_id?: string | null
          status?: string
          storage_path?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      distribution_settings: {
        Row: {
          auto_enabled: boolean
          created_at: string
          id: number
          languages: string[]
          last_run_at: string | null
          last_run_result: string | null
          on_failure: string
          run_hour: number
          timezone: string
          updated_at: string
        }
        Insert: {
          auto_enabled?: boolean
          created_at?: string
          id?: number
          languages?: string[]
          last_run_at?: string | null
          last_run_result?: string | null
          on_failure?: string
          run_hour?: number
          timezone?: string
          updated_at?: string
        }
        Update: {
          auto_enabled?: boolean
          created_at?: string
          id?: number
          languages?: string[]
          last_run_at?: string | null
          last_run_result?: string | null
          on_failure?: string
          run_hour?: number
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      job_control: {
        Row: {
          id: number
          paused: boolean
          paused_at: string | null
          paused_reason: string | null
        }
        Insert: {
          id?: number
          paused?: boolean
          paused_at?: string | null
          paused_reason?: string | null
        }
        Update: {
          id?: number
          paused?: boolean
          paused_at?: string | null
          paused_reason?: string | null
        }
        Relationships: []
      }
      job_events: {
        Row: {
          created_at: string
          id: number
          job_id: string
          level: string
          message: string | null
          step: string
        }
        Insert: {
          created_at?: string
          id?: number
          job_id: string
          level?: string
          message?: string | null
          step: string
        }
        Update: {
          created_at?: string
          id?: number
          job_id?: string
          level?: string
          message?: string | null
          step?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "render_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      language_settings: {
        Row: {
          eleven_voice_id: string | null
          enabled: boolean
          language: string
          music_style: string
          narration_style: string
          updated_at: string
          visual_style: string
          voice_speed: number
        }
        Insert: {
          eleven_voice_id?: string | null
          enabled?: boolean
          language: string
          music_style?: string
          narration_style?: string
          updated_at?: string
          visual_style?: string
          voice_speed?: number
        }
        Update: {
          eleven_voice_id?: string | null
          enabled?: boolean
          language?: string
          music_style?: string
          narration_style?: string
          updated_at?: string
          visual_style?: string
          voice_speed?: number
        }
        Relationships: []
      }
      music_tracks: {
        Row: {
          created_at: string
          duration_sec: number
          id: string
          name: string
          path: string
          styles: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          duration_sec?: number
          id?: string
          name: string
          path: string
          styles?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          duration_sec?: number
          id?: string
          name?: string
          path?: string
          styles?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      poster_accounts: {
        Row: {
          created_at: string
          followers: number
          gmail_address: string | null
          handle: string
          id: string
          notes: string | null
          platform: string
          poster_id: string
          profile_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          followers?: number
          gmail_address?: string | null
          handle: string
          id?: string
          notes?: string | null
          platform: string
          poster_id: string
          profile_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          followers?: number
          gmail_address?: string | null
          handle?: string
          id?: string
          notes?: string | null
          platform?: string
          poster_id?: string
          profile_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "poster_accounts_poster_id_fkey"
            columns: ["poster_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          country: string | null
          created_at: string
          email: string
          full_name: string
          gmail_address: string | null
          id: string
          language: string
          role: Database["public"]["Enums"]["app_role"]
          status: string
          updated_at: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          email?: string
          full_name?: string
          gmail_address?: string | null
          id: string
          language?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          updated_at?: string
        }
        Update: {
          country?: string | null
          created_at?: string
          email?: string
          full_name?: string
          gmail_address?: string | null
          id?: string
          language?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      render_jobs: {
        Row: {
          attempts: number
          callback_url: string | null
          client_id: string | null
          created_at: string
          duration_sec: number
          error: string | null
          id: string
          include_cta: boolean
          language: string
          lease_until: string | null
          narration_style: string
          poster_id: string | null
          progress: number
          scenes: Json
          script: Json | null
          status: string
          step: string
          topic: string | null
          topic_category: string
          updated_at: string
          video_path: string | null
          visual_style: string
          voice_engine: string
          voice_id: string | null
        }
        Insert: {
          attempts?: number
          callback_url?: string | null
          client_id?: string | null
          created_at?: string
          duration_sec?: number
          error?: string | null
          id?: string
          include_cta?: boolean
          language?: string
          lease_until?: string | null
          narration_style?: string
          poster_id?: string | null
          progress?: number
          scenes?: Json
          script?: Json | null
          status?: string
          step?: string
          topic?: string | null
          topic_category?: string
          updated_at?: string
          video_path?: string | null
          visual_style?: string
          voice_engine?: string
          voice_id?: string | null
        }
        Update: {
          attempts?: number
          callback_url?: string | null
          client_id?: string | null
          created_at?: string
          duration_sec?: number
          error?: string | null
          id?: string
          include_cta?: boolean
          language?: string
          lease_until?: string | null
          narration_style?: string
          poster_id?: string | null
          progress?: number
          scenes?: Json
          script?: Json | null
          status?: string
          step?: string
          topic?: string | null
          topic_category?: string
          updated_at?: string
          video_path?: string | null
          visual_style?: string
          voice_engine?: string
          voice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "render_jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "api_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      topic_queue: {
        Row: {
          angle: string | null
          category: string
          created_at: string
          id: string
          narration_style: string
          position: number
          status: string
          topic: string
          used_at: string | null
          video_job_id: string | null
        }
        Insert: {
          angle?: string | null
          category?: string
          created_at?: string
          id?: string
          narration_style?: string
          position?: number
          status?: string
          topic: string
          used_at?: string | null
          video_job_id?: string | null
        }
        Update: {
          angle?: string | null
          category?: string
          created_at?: string
          id?: string
          narration_style?: string
          position?: number
          status?: string
          topic?: string
          used_at?: string | null
          video_job_id?: string | null
        }
        Relationships: []
      }
      video_downloads: {
        Row: {
          daily_video_id: string
          downloaded_at: string
          id: string
          posted_at: string | null
          posted_url: string | null
          poster_id: string
        }
        Insert: {
          daily_video_id: string
          downloaded_at?: string
          id?: string
          posted_at?: string | null
          posted_url?: string | null
          poster_id: string
        }
        Update: {
          daily_video_id?: string
          downloaded_at?: string
          id?: string
          posted_at?: string | null
          posted_url?: string | null
          poster_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_downloads_daily_video_id_fkey"
            columns: ["daily_video_id"]
            isOneToOne: false
            referencedRelation: "daily_videos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_downloads_poster_id_fkey"
            columns: ["poster_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_rates: {
        Row: {
          chars: number
          created_at: string
          id: string
          language: string
          seconds: number
          takes: number
          updated_at: string
          voice_id: string
        }
        Insert: {
          chars?: number
          created_at?: string
          id?: string
          language: string
          seconds?: number
          takes?: number
          updated_at?: string
          voice_id: string
        }
        Update: {
          chars?: number
          created_at?: string
          id?: string
          language?: string
          seconds?: number
          takes?: number
          updated_at?: string
          voice_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_render_job: {
        Args: { lease_seconds?: number }
        Returns: {
          attempts: number
          callback_url: string | null
          client_id: string | null
          created_at: string
          duration_sec: number
          error: string | null
          id: string
          include_cta: boolean
          language: string
          lease_until: string | null
          narration_style: string
          poster_id: string | null
          progress: number
          scenes: Json
          script: Json | null
          status: string
          step: string
          topic: string | null
          topic_category: string
          updated_at: string
          video_path: string | null
          visual_style: string
          voice_engine: string
          voice_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "render_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "poster"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "poster"],
    },
  },
} as const
