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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      account_verifications: {
        Row: {
          created_at: string
          email_verified: boolean
          id: string
          identity_verified: boolean
          payout_verified: boolean
          phone_verified: boolean
          updated_at: string
          user_id: string
          verification_notes: string | null
        }
        Insert: {
          created_at?: string
          email_verified?: boolean
          id?: string
          identity_verified?: boolean
          payout_verified?: boolean
          phone_verified?: boolean
          updated_at?: string
          user_id: string
          verification_notes?: string | null
        }
        Update: {
          created_at?: string
          email_verified?: boolean
          id?: string
          identity_verified?: boolean
          payout_verified?: boolean
          phone_verified?: boolean
          updated_at?: string
          user_id?: string
          verification_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_verifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          browser_name: string | null
          created_at: string
          device_fingerprint: string | null
          device_name: string | null
          id: string
          is_trusted: boolean
          last_ip: unknown
          last_seen_at: string | null
          platform: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          browser_name?: string | null
          created_at?: string
          device_fingerprint?: string | null
          device_name?: string | null
          id?: string
          is_trusted?: boolean
          last_ip?: unknown
          last_seen_at?: string | null
          platform?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          browser_name?: string | null
          created_at?: string
          device_fingerprint?: string | null
          device_name?: string | null
          id?: string
          is_trusted?: boolean
          last_ip?: unknown
          last_seen_at?: string | null
          platform?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string
          delivery_updates: boolean
          dispute_updates: boolean
          id: string
          marketing_messages: boolean
          payment_updates: boolean
          system_alerts: boolean
          updated_at: string
          user_id: string
          verification_reminders: boolean
        }
        Insert: {
          created_at?: string
          delivery_updates?: boolean
          dispute_updates?: boolean
          id?: string
          marketing_messages?: boolean
          payment_updates?: boolean
          system_alerts?: boolean
          updated_at?: string
          user_id: string
          verification_reminders?: boolean
        }
        Update: {
          created_at?: string
          delivery_updates?: boolean
          dispute_updates?: boolean
          id?: string
          marketing_messages?: boolean
          payment_updates?: boolean
          system_alerts?: boolean
          updated_at?: string
          user_id?: string
          verification_reminders?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          city_name: string | null
          country_code: string
          created_at: string
          default_region_id: string | null
          default_role: Database["public"]["Enums"]["user_role_type"]
          email: string
          full_name: string
          id: string
          is_region_eligible: boolean
          last_login_at: string | null
          phone: string | null
          state_name: string | null
          status: Database["public"]["Enums"]["profile_status"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          city_name?: string | null
          country_code?: string
          created_at?: string
          default_region_id?: string | null
          default_role?: Database["public"]["Enums"]["user_role_type"]
          email: string
          full_name: string
          id: string
          is_region_eligible?: boolean
          last_login_at?: string | null
          phone?: string | null
          state_name?: string | null
          status?: Database["public"]["Enums"]["profile_status"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          city_name?: string | null
          country_code?: string
          created_at?: string
          default_region_id?: string | null
          default_role?: Database["public"]["Enums"]["user_role_type"]
          email?: string
          full_name?: string
          id?: string
          is_region_eligible?: boolean
          last_login_at?: string | null
          phone?: string | null
          state_name?: string | null
          status?: Database["public"]["Enums"]["profile_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_default_region_id_fkey"
            columns: ["default_region_id"]
            isOneToOne: false
            referencedRelation: "serviceable_regions"
            referencedColumns: ["id"]
          },
        ]
      }
      serviceable_regions: {
        Row: {
          city_name: string
          country_code: string
          created_at: string
          id: string
          is_active: boolean
          launch_phase: number
          state_name: string
          updated_at: string
        }
        Insert: {
          city_name: string
          country_code: string
          created_at?: string
          id?: string
          is_active?: boolean
          launch_phase?: number
          state_name: string
          updated_at?: string
        }
        Update: {
          city_name?: string
          country_code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          launch_phase?: number
          state_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      transaction_delivery_terms: {
        Row: {
          created_at: string
          delivery_address_line1: string | null
          delivery_address_line2: string | null
          delivery_city: string | null
          delivery_country_code: string | null
          delivery_method: Database["public"]["Enums"]["delivery_method_type"]
          delivery_postal_code: string | null
          delivery_state: string | null
          expected_delivery_date: string
          id: string
          transaction_id: string
          updated_at: string
          verification_window_hours: number
        }
        Insert: {
          created_at?: string
          delivery_address_line1?: string | null
          delivery_address_line2?: string | null
          delivery_city?: string | null
          delivery_country_code?: string | null
          delivery_method: Database["public"]["Enums"]["delivery_method_type"]
          delivery_postal_code?: string | null
          delivery_state?: string | null
          expected_delivery_date: string
          id?: string
          transaction_id: string
          updated_at?: string
          verification_window_hours: number
        }
        Update: {
          created_at?: string
          delivery_address_line1?: string | null
          delivery_address_line2?: string | null
          delivery_city?: string | null
          delivery_country_code?: string | null
          delivery_method?: Database["public"]["Enums"]["delivery_method_type"]
          delivery_postal_code?: string | null
          delivery_state?: string | null
          expected_delivery_date?: string
          id?: string
          transaction_id?: string
          updated_at?: string
          verification_window_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "transaction_delivery_terms_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_items: {
        Row: {
          brand: string | null
          condition_label: Database["public"]["Enums"]["item_condition"]
          created_at: string
          description: string
          id: string
          model: string | null
          quantity: number
          title: string
          transaction_id: string
          updated_at: string
          warranty_info: string | null
        }
        Insert: {
          brand?: string | null
          condition_label: Database["public"]["Enums"]["item_condition"]
          created_at?: string
          description: string
          id?: string
          model?: string | null
          quantity?: number
          title: string
          transaction_id: string
          updated_at?: string
          warranty_info?: string | null
        }
        Update: {
          brand?: string | null
          condition_label?: Database["public"]["Enums"]["item_condition"]
          created_at?: string
          description?: string
          id?: string
          model?: string | null
          quantity?: number
          title?: string
          transaction_id?: string
          updated_at?: string
          warranty_info?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transaction_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_links: {
        Row: {
          created_at: string
          expires_at: string | null
          first_opened_at: string | null
          id: string
          is_active: boolean
          last_opened_at: string | null
          opened_count: number
          share_token: string
          transaction_id: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          first_opened_at?: string | null
          id?: string
          is_active?: boolean
          last_opened_at?: string | null
          opened_count?: number
          share_token: string
          transaction_id: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          first_opened_at?: string | null
          id?: string
          is_active?: boolean
          last_opened_at?: string | null
          opened_count?: number
          share_token?: string
          transaction_id?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_links_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_notes: {
        Row: {
          created_at: string
          id: string
          seller_notes: string | null
          transaction_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          seller_notes?: string | null
          transaction_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          seller_notes?: string | null
          transaction_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_notes_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_participants: {
        Row: {
          created_at: string
          display_name: string
          email: string | null
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["transaction_party_role"]
          transaction_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          display_name: string
          email?: string | null
          id?: string
          phone?: string | null
          role: Database["public"]["Enums"]["transaction_party_role"]
          transaction_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string | null
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["transaction_party_role"]
          transaction_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transaction_participants_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_pricing: {
        Row: {
          buyer_total_amount: number
          created_at: string
          currency_code: string
          id: string
          item_amount: number
          platform_fee_amount: number
          processing_fee_amount: number
          seller_net_amount: number
          transaction_id: string
          updated_at: string
        }
        Insert: {
          buyer_total_amount: number
          created_at?: string
          currency_code: string
          id?: string
          item_amount: number
          platform_fee_amount?: number
          processing_fee_amount?: number
          seller_net_amount: number
          transaction_id: string
          updated_at?: string
        }
        Update: {
          buyer_total_amount?: number
          created_at?: string
          currency_code?: string
          id?: string
          item_amount?: number
          platform_fee_amount?: number
          processing_fee_amount?: number
          seller_net_amount?: number
          transaction_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_pricing_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          agreement_locked_at: string | null
          buyer_contact_email: string | null
          buyer_contact_phone: string | null
          buyer_id: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          created_by_user_id: string
          delivered_at: string | null
          dispute_status: Database["public"]["Enums"]["dispute_status"]
          id: string
          money_status: Database["public"]["Enums"]["money_status"]
          payment_received_at: string | null
          region_id: string | null
          seller_id: string
          share_link_expires_at: string | null
          share_token: string
          status: Database["public"]["Enums"]["transaction_status"]
          transaction_code: string
          updated_at: string
          verification_deadline_at: string | null
        }
        Insert: {
          agreement_locked_at?: string | null
          buyer_contact_email?: string | null
          buyer_contact_phone?: string | null
          buyer_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by_user_id: string
          delivered_at?: string | null
          dispute_status?: Database["public"]["Enums"]["dispute_status"]
          id?: string
          money_status?: Database["public"]["Enums"]["money_status"]
          payment_received_at?: string | null
          region_id?: string | null
          seller_id: string
          share_link_expires_at?: string | null
          share_token: string
          status?: Database["public"]["Enums"]["transaction_status"]
          transaction_code: string
          updated_at?: string
          verification_deadline_at?: string | null
        }
        Update: {
          agreement_locked_at?: string | null
          buyer_contact_email?: string | null
          buyer_contact_phone?: string | null
          buyer_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by_user_id?: string
          delivered_at?: string | null
          dispute_status?: Database["public"]["Enums"]["dispute_status"]
          id?: string
          money_status?: Database["public"]["Enums"]["money_status"]
          payment_received_at?: string | null
          region_id?: string | null
          seller_id?: string
          share_link_expires_at?: string | null
          share_token?: string
          status?: Database["public"]["Enums"]["transaction_status"]
          transaction_code?: string
          updated_at?: string
          verification_deadline_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "serviceable_regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_region_access_logs: {
        Row: {
          access_result: string
          city_name: string | null
          country_code: string | null
          created_at: string
          id: string
          ip_address: unknown
          reason: string | null
          state_name: string | null
          user_id: string | null
        }
        Insert: {
          access_result: string
          city_name?: string | null
          country_code?: string | null
          created_at?: string
          id?: string
          ip_address?: unknown
          reason?: string | null
          state_name?: string | null
          user_id?: string | null
        }
        Update: {
          access_result?: string
          city_name?: string | null
          country_code?: string | null
          created_at?: string
          id?: string
          ip_address?: unknown
          reason?: string | null
          state_name?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_region_access_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          role: Database["public"]["Enums"]["user_role_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          role: Database["public"]["Enums"]["user_role_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          role?: Database["public"]["Enums"]["user_role_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sessions: {
        Row: {
          city_name: string | null
          country_code: string | null
          created_at: string
          device_id: string | null
          id: string
          ip_address: unknown
          is_active: boolean
          last_seen_at: string
          revoke_reason: string | null
          revoked_at: string | null
          session_token_hash: string
          state_name: string | null
          user_id: string
        }
        Insert: {
          city_name?: string | null
          country_code?: string | null
          created_at?: string
          device_id?: string | null
          id?: string
          ip_address?: unknown
          is_active?: boolean
          last_seen_at?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          session_token_hash: string
          state_name?: string | null
          user_id: string
        }
        Update: {
          city_name?: string | null
          country_code?: string | null
          created_at?: string
          device_id?: string | null
          id?: string
          ip_address?: unknown
          is_active?: boolean
          last_seen_at?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          session_token_hash?: string
          state_name?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sessions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["user_role_type"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      delivery_method_type: "courier" | "pickup" | "meetup" | "hand_delivery"
      dispute_status:
        | "none"
        | "open"
        | "seller_response_pending"
        | "under_review"
        | "resolved"
      item_condition:
        | "brand_new"
        | "like_new"
        | "excellent"
        | "good"
        | "fair"
        | "used"
      money_status:
        | "not_secured"
        | "payment_pending"
        | "funds_held_in_escrow"
        | "funds_frozen"
        | "funds_releasing"
        | "funds_released"
        | "refund_pending"
        | "refund_issued"
      profile_status: "active" | "suspended" | "blocked"
      transaction_party_role: "buyer" | "seller"
      transaction_status:
        | "draft"
        | "awaiting_buyer"
        | "awaiting_payment"
        | "payment_secured"
        | "seller_preparing_delivery"
        | "seller_dispatched"
        | "delivered_awaiting_verification"
        | "completed"
        | "disputed"
        | "cancelled"
        | "timed_out"
      user_role_type: "buyer" | "seller" | "admin"
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
    Enums: {
      delivery_method_type: ["courier", "pickup", "meetup", "hand_delivery"],
      dispute_status: [
        "none",
        "open",
        "seller_response_pending",
        "under_review",
        "resolved",
      ],
      item_condition: [
        "brand_new",
        "like_new",
        "excellent",
        "good",
        "fair",
        "used",
      ],
      money_status: [
        "not_secured",
        "payment_pending",
        "funds_held_in_escrow",
        "funds_frozen",
        "funds_releasing",
        "funds_released",
        "refund_pending",
        "refund_issued",
      ],
      profile_status: ["active", "suspended", "blocked"],
      transaction_party_role: ["buyer", "seller"],
      transaction_status: [
        "draft",
        "awaiting_buyer",
        "awaiting_payment",
        "payment_secured",
        "seller_preparing_delivery",
        "seller_dispatched",
        "delivered_awaiting_verification",
        "completed",
        "disputed",
        "cancelled",
        "timed_out",
      ],
      user_role_type: ["buyer", "seller", "admin"],
    },
  },
} as const
