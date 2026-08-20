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
    PostgrestVersion: "14.15"
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
      render_jobs: {
        Row: {
          attempts: number
          callback_url: string | null
          client_id: string | null
          created_at: string
          duration_sec: number
          error: string | null
          id: string
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
    }
    Enums: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
