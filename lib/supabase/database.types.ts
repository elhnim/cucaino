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
      allowance_payouts: {
        Row: {
          allowance_cents: number
          family_id: string
          id: string
          kid_id: string
          paid_at: string
          pay_date: string
          strike_count: number
        }
        Insert: {
          allowance_cents?: number
          family_id: string
          id?: string
          kid_id: string
          paid_at?: string
          pay_date: string
          strike_count?: number
        }
        Update: {
          allowance_cents?: number
          family_id?: string
          id?: string
          kid_id?: string
          paid_at?: string
          pay_date?: string
          strike_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "allowance_payouts_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allowance_payouts_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      badge_config_overrides: {
        Row: {
          bronze_bonus_cash_cents: number
          bronze_bonus_stars: number
          bronze_name: string | null
          bronze_threshold: number | null
          category: string
          family_id: string
          gold_bonus_cash_cents: number
          gold_bonus_stars: number
          gold_name: string | null
          gold_threshold: number | null
          id: string
          silver_bonus_cash_cents: number
          silver_bonus_stars: number
          silver_name: string | null
          silver_threshold: number | null
        }
        Insert: {
          bronze_bonus_cash_cents?: number
          bronze_bonus_stars?: number
          bronze_name?: string | null
          bronze_threshold?: number | null
          category: string
          family_id: string
          gold_bonus_cash_cents?: number
          gold_bonus_stars?: number
          gold_name?: string | null
          gold_threshold?: number | null
          id?: string
          silver_bonus_cash_cents?: number
          silver_bonus_stars?: number
          silver_name?: string | null
          silver_threshold?: number | null
        }
        Update: {
          bronze_bonus_cash_cents?: number
          bronze_bonus_stars?: number
          bronze_name?: string | null
          bronze_threshold?: number | null
          category?: string
          family_id?: string
          gold_bonus_cash_cents?: number
          gold_bonus_stars?: number
          gold_name?: string | null
          gold_threshold?: number | null
          id?: string
          silver_bonus_cash_cents?: number
          silver_bonus_stars?: number
          silver_name?: string | null
          silver_threshold?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "badge_config_overrides_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      badge_progress: {
        Row: {
          bronze_earned_at: string | null
          category: string
          completion_count: number
          gold_earned_at: string | null
          id: string
          kid_id: string
          silver_earned_at: string | null
        }
        Insert: {
          bronze_earned_at?: string | null
          category: string
          completion_count?: number
          gold_earned_at?: string | null
          id?: string
          kid_id: string
          silver_earned_at?: string | null
        }
        Update: {
          bronze_earned_at?: string | null
          category?: string
          completion_count?: number
          gold_earned_at?: string | null
          id?: string
          kid_id?: string
          silver_earned_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "badge_progress_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      badges: {
        Row: {
          criteria: Json
          description: string | null
          icon: string
          id: string
          name: string
        }
        Insert: {
          criteria: Json
          description?: string | null
          icon: string
          id: string
          name: string
        }
        Update: {
          criteria?: Json
          description?: string | null
          icon?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      cash_transactions: {
        Row: {
          amount_cents: number
          created_at: string
          description: string
          family_id: string
          id: string
          kid_id: string
          type: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          description: string
          family_id: string
          id?: string
          kid_id: string
          type: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          description?: string
          family_id?: string
          id?: string
          kid_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_transactions_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_transactions_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_read_state: {
        Row: {
          kid_id: string
          last_read_at: string
          other_kid_id: string
        }
        Insert: {
          kid_id: string
          last_read_at?: string
          other_kid_id: string
        }
        Update: {
          kid_id?: string
          last_read_at?: string
          other_kid_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_read_state_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_read_state_other_kid_id_fkey"
            columns: ["other_kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_badge_progress: {
        Row: {
          badge_id: string
          bronze_earned_at: string | null
          current_count: number
          current_tier: string
          family_id: string
          gold_earned_at: string | null
          id: string
          kid_id: string
          last_completed_date: string | null
          silver_earned_at: string | null
        }
        Insert: {
          badge_id: string
          bronze_earned_at?: string | null
          current_count?: number
          current_tier?: string
          family_id: string
          gold_earned_at?: string | null
          id?: string
          kid_id: string
          last_completed_date?: string | null
          silver_earned_at?: string | null
        }
        Update: {
          badge_id?: string
          bronze_earned_at?: string | null
          current_count?: number
          current_tier?: string
          family_id?: string
          gold_earned_at?: string | null
          id?: string
          kid_id?: string
          last_completed_date?: string | null
          silver_earned_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_badge_progress_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "custom_badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_badge_progress_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_badge_progress_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_badges: {
        Row: {
          active: boolean
          bronze_bonus_cash_cents: number
          bronze_bonus_stars: number
          bronze_threshold: number
          created_at: string
          description: string | null
          family_id: string
          gold_bonus_cash_cents: number
          gold_bonus_stars: number
          gold_threshold: number
          icon: string
          id: string
          kid_ids: string[] | null
          name: string
          silver_bonus_cash_cents: number
          silver_bonus_stars: number
          silver_threshold: number
          task_id: string
          track_type: string
        }
        Insert: {
          active?: boolean
          bronze_bonus_cash_cents?: number
          bronze_bonus_stars?: number
          bronze_threshold?: number
          created_at?: string
          description?: string | null
          family_id: string
          gold_bonus_cash_cents?: number
          gold_bonus_stars?: number
          gold_threshold?: number
          icon?: string
          id?: string
          kid_ids?: string[] | null
          name: string
          silver_bonus_cash_cents?: number
          silver_bonus_stars?: number
          silver_threshold?: number
          task_id: string
          track_type?: string
        }
        Update: {
          active?: boolean
          bronze_bonus_cash_cents?: number
          bronze_bonus_stars?: number
          bronze_threshold?: number
          created_at?: string
          description?: string | null
          family_id?: string
          gold_bonus_cash_cents?: number
          gold_bonus_stars?: number
          gold_threshold?: number
          icon?: string
          id?: string
          kid_ids?: string[] | null
          name?: string
          silver_bonus_cash_cents?: number
          silver_bonus_stars?: number
          silver_threshold?: number
          task_id?: string
          track_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_badges_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_badges_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      families: {
        Row: {
          co_parent_user_ids: string[]
          created_at: string
          family_points_balance: number
          id: string
          is_founder: boolean
          name: string
          owner_user_id: string
          parent_avatar: string | null
          parent_display_name: string | null
          parent_goals: string[]
          parent_goals_other: string | null
          parent_pin: string | null
          parent_tour_seen: boolean
          pay_day_of_week: number | null
          timezone: string
          weather_city: string | null
          weather_lat: number | null
          weather_lon: number | null
          weekly_allowance_cents: number
        }
        Insert: {
          co_parent_user_ids?: string[]
          created_at?: string
          family_points_balance?: number
          id?: string
          is_founder?: boolean
          name: string
          owner_user_id: string
          parent_avatar?: string | null
          parent_display_name?: string | null
          parent_goals?: string[]
          parent_goals_other?: string | null
          parent_pin?: string | null
          parent_tour_seen?: boolean
          pay_day_of_week?: number | null
          timezone?: string
          weather_city?: string | null
          weather_lat?: number | null
          weather_lon?: number | null
          weekly_allowance_cents?: number
        }
        Update: {
          co_parent_user_ids?: string[]
          created_at?: string
          family_points_balance?: number
          id?: string
          is_founder?: boolean
          name?: string
          owner_user_id?: string
          parent_avatar?: string | null
          parent_display_name?: string | null
          parent_goals?: string[]
          parent_goals_other?: string | null
          parent_pin?: string | null
          parent_tour_seen?: boolean
          pay_day_of_week?: number | null
          timezone?: string
          weather_city?: string | null
          weather_lat?: number | null
          weather_lon?: number | null
          weekly_allowance_cents?: number
        }
        Relationships: []
      }
      family_invites: {
        Row: {
          created_at: string
          expires_at: string
          family_id: string
          id: string
          invited_email: string
          status: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          family_id: string
          id?: string
          invited_email: string
          status?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          family_id?: string
          id?: string
          invited_email?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_invites_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_requests: {
        Row: {
          category: string
          created_at: string
          description: string | null
          family_id: string
          id: string
          kid_id: string | null
          status: string
          title: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          family_id: string
          id?: string
          kid_id?: string | null
          status?: string
          title: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          family_id?: string
          id?: string
          kid_id?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_requests_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_requests_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      invest_accounts: {
        Row: {
          cash_cents: number
          created_at: string
          family_id: string
          id: string
          kid_id: string
          total_deposited_cents: number
          total_withdrawn_cents: number
          updated_at: string
        }
        Insert: {
          cash_cents?: number
          created_at?: string
          family_id: string
          id?: string
          kid_id: string
          total_deposited_cents?: number
          total_withdrawn_cents?: number
          updated_at?: string
        }
        Update: {
          cash_cents?: number
          created_at?: string
          family_id?: string
          id?: string
          kid_id?: string
          total_deposited_cents?: number
          total_withdrawn_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invest_accounts_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invest_accounts_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: true
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      invest_holdings: {
        Row: {
          asset_symbol: string
          avg_cost_cents: number
          created_at: string
          family_id: string
          id: string
          kid_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          asset_symbol: string
          avg_cost_cents?: number
          created_at?: string
          family_id: string
          id?: string
          kid_id: string
          quantity?: number
          updated_at?: string
        }
        Update: {
          asset_symbol?: string
          avg_cost_cents?: number
          created_at?: string
          family_id?: string
          id?: string
          kid_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invest_holdings_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invest_holdings_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      invest_licences: {
        Row: {
          attempts: number
          best_score: number
          created_at: string
          family_id: string
          id: string
          kid_id: string
          lessons_completed: Json
          passed_at: string | null
          rewarded: boolean
          updated_at: string
        }
        Insert: {
          attempts?: number
          best_score?: number
          created_at?: string
          family_id: string
          id?: string
          kid_id: string
          lessons_completed?: Json
          passed_at?: string | null
          rewarded?: boolean
          updated_at?: string
        }
        Update: {
          attempts?: number
          best_score?: number
          created_at?: string
          family_id?: string
          id?: string
          kid_id?: string
          lessons_completed?: Json
          passed_at?: string | null
          rewarded?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invest_licences_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invest_licences_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: true
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      invest_transactions: {
        Row: {
          asset_symbol: string | null
          created_at: string
          family_id: string
          id: string
          kid_id: string
          price_cents: number | null
          quantity: number | null
          total_cents: number
          type: string
        }
        Insert: {
          asset_symbol?: string | null
          created_at?: string
          family_id: string
          id?: string
          kid_id: string
          price_cents?: number | null
          quantity?: number | null
          total_cents: number
          type: string
        }
        Update: {
          asset_symbol?: string | null
          created_at?: string
          family_id?: string
          id?: string
          kid_id?: string
          price_cents?: number | null
          quantity?: number | null
          total_cents?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "invest_transactions_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invest_transactions_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      kid_badges: {
        Row: {
          badge_id: string
          earned_at: string
          kid_id: string
        }
        Insert: {
          badge_id: string
          earned_at?: string
          kid_id: string
        }
        Update: {
          badge_id?: string
          earned_at?: string
          kid_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kid_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_badges_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      kid_daily_task_additions: {
        Row: {
          created_at: string | null
          date: string
          family_id: string
          id: string
          kid_id: string
          task_id: string
        }
        Insert: {
          created_at?: string | null
          date?: string
          family_id: string
          id?: string
          kid_id: string
          task_id: string
        }
        Update: {
          created_at?: string | null
          date?: string
          family_id?: string
          id?: string
          kid_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kid_daily_task_additions_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_daily_task_additions_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_daily_task_additions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      kid_friendships: {
        Row: {
          created_at: string
          friend_id: string
          id: string
          kid_id: string
          status: string
        }
        Insert: {
          created_at?: string
          friend_id: string
          id?: string
          kid_id: string
          status: string
        }
        Update: {
          created_at?: string
          friend_id?: string
          id?: string
          kid_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "kid_friendships_friend_id_fkey"
            columns: ["friend_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_friendships_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      kid_pets: {
        Row: {
          accessories: Json
          care_streak: number
          cleanliness: number
          created_at: string
          energy: number
          family_id: string
          happiness: number
          hunger: number
          id: string
          is_sleeping: boolean
          kid_id: string
          last_care_date: string | null
          last_gift_date: string | null
          last_tick_at: string
          name: string
          species: string
          total_stars_spent: number
          tricks: Json
          xp: number
        }
        Insert: {
          accessories?: Json
          care_streak?: number
          cleanliness?: number
          created_at?: string
          energy?: number
          family_id: string
          happiness?: number
          hunger?: number
          id?: string
          is_sleeping?: boolean
          kid_id: string
          last_care_date?: string | null
          last_gift_date?: string | null
          last_tick_at?: string
          name: string
          species: string
          total_stars_spent?: number
          tricks?: Json
          xp?: number
        }
        Update: {
          accessories?: Json
          care_streak?: number
          cleanliness?: number
          created_at?: string
          energy?: number
          family_id?: string
          happiness?: number
          hunger?: number
          id?: string
          is_sleeping?: boolean
          kid_id?: string
          last_care_date?: string | null
          last_gift_date?: string | null
          last_tick_at?: string
          name?: string
          species?: string
          total_stars_spent?: number
          tricks?: Json
          xp?: number
        }
        Relationships: [
          {
            foreignKeyName: "kid_pets_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_pets_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: true
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      kid_timetable: {
        Row: {
          day_of_week: number
          id: string
          is_override: boolean
          kid_id: string
          override_date: string | null
          section: string
          slot_index: number
          subject_id: string
        }
        Insert: {
          day_of_week: number
          id?: string
          is_override?: boolean
          kid_id: string
          override_date?: string | null
          section: string
          slot_index: number
          subject_id: string
        }
        Update: {
          day_of_week?: number
          id?: string
          is_override?: boolean
          kid_id?: string
          override_date?: string | null
          section?: string
          slot_index?: number
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kid_timetable_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      kids: {
        Row: {
          age: number | null
          avatar: string
          cash_balance: number
          created_at: string
          current_streak: number
          date_of_birth: string | null
          family_id: string
          friends_feature_seen: boolean
          goals: string[]
          goals_other: string | null
          id: string
          interests: string[]
          interests_other: string | null
          investing_enabled: boolean
          last_active_date: string | null
          longest_streak: number
          name: string
          pin_hash: string | null
          points_balance: number
          selected_avatar_emoji: string | null
          selected_frame: string | null
          sparks_balance: number
          theme_id: string
          total_completions: number
          total_stars_earned: number
          tour_seen: boolean
          username: string | null
        }
        Insert: {
          age?: number | null
          avatar?: string
          cash_balance?: number
          created_at?: string
          current_streak?: number
          date_of_birth?: string | null
          family_id: string
          friends_feature_seen?: boolean
          goals?: string[]
          goals_other?: string | null
          id?: string
          interests?: string[]
          interests_other?: string | null
          investing_enabled?: boolean
          last_active_date?: string | null
          longest_streak?: number
          name: string
          pin_hash?: string | null
          points_balance?: number
          selected_avatar_emoji?: string | null
          selected_frame?: string | null
          sparks_balance?: number
          theme_id?: string
          total_completions?: number
          total_stars_earned?: number
          tour_seen?: boolean
          username?: string | null
        }
        Update: {
          age?: number | null
          avatar?: string
          cash_balance?: number
          created_at?: string
          current_streak?: number
          date_of_birth?: string | null
          family_id?: string
          friends_feature_seen?: boolean
          goals?: string[]
          goals_other?: string | null
          id?: string
          interests?: string[]
          interests_other?: string | null
          investing_enabled?: boolean
          last_active_date?: string | null
          longest_streak?: number
          name?: string
          pin_hash?: string | null
          points_balance?: number
          selected_avatar_emoji?: string | null
          selected_frame?: string | null
          sparks_balance?: number
          theme_id?: string
          total_completions?: number
          total_stars_earned?: number
          tour_seen?: boolean
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kids_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kids_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "themes"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          created_at: string
          id: string
          recipient_id: string
          sender_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          recipient_id: string
          sender_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          recipient_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      mood_entries: {
        Row: {
          date: string
          family_id: string
          id: string
          kid_id: string
          logged_at: string
          mood: string
        }
        Insert: {
          date?: string
          family_id: string
          id?: string
          kid_id: string
          logged_at?: string
          mood: string
        }
        Update: {
          date?: string
          family_id?: string
          id?: string
          kid_id?: string
          logged_at?: string
          mood?: string
        }
        Relationships: [
          {
            foreignKeyName: "mood_entries_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mood_entries_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      perf_metrics: {
        Row: {
          app_version: string | null
          created_at: string
          device_type: string | null
          id: string
          kid_id: string | null
          metric_name: string
          page: string | null
          query_name: string | null
          rating: string | null
          value: number
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          device_type?: string | null
          id?: string
          kid_id?: string | null
          metric_name: string
          page?: string | null
          query_name?: string | null
          rating?: string | null
          value: number
        }
        Update: {
          app_version?: string | null
          created_at?: string
          device_type?: string | null
          id?: string
          kid_id?: string | null
          metric_name?: string
          page?: string | null
          query_name?: string | null
          rating?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "perf_metrics_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_answers: {
        Row: {
          chosen_index: number | null
          id: string
          is_correct: boolean
          kid_id: string
          question_id: string
          session_id: string
          time_taken_ms: number | null
        }
        Insert: {
          chosen_index?: number | null
          id?: string
          is_correct: boolean
          kid_id: string
          question_id: string
          session_id: string
          time_taken_ms?: number | null
        }
        Update: {
          chosen_index?: number | null
          id?: string
          is_correct?: boolean
          kid_id?: string
          question_id?: string
          session_id?: string
          time_taken_ms?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_answers_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "quiz_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_answers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "quiz_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_banks: {
        Row: {
          category: string
          description: string | null
          family_id: string | null
          id: string
          is_builtin: boolean
          max_age: number
          min_age: number
          name: string
        }
        Insert: {
          category: string
          description?: string | null
          family_id?: string | null
          id?: string
          is_builtin?: boolean
          max_age?: number
          min_age?: number
          name: string
        }
        Update: {
          category?: string
          description?: string | null
          family_id?: string | null
          id?: string
          is_builtin?: boolean
          max_age?: number
          min_age?: number
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_banks_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_questions: {
        Row: {
          bank_id: string
          choices: Json
          explanation: string | null
          id: string
          prompt: string
          time_limit_seconds: number
        }
        Insert: {
          bank_id: string
          choices: Json
          explanation?: string | null
          id?: string
          prompt: string
          time_limit_seconds?: number
        }
        Update: {
          bank_id?: string
          choices?: Json
          explanation?: string | null
          id?: string
          prompt?: string
          time_limit_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "quiz_questions_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "quiz_banks"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_questions2: {
        Row: {
          accepted_answers: string[] | null
          age_band: string
          choices: Json | null
          created_at: string
          difficulty: string
          explanation: string | null
          family_id: string | null
          id: string
          is_builtin: boolean
          question_text: string
          sentence_template: string | null
          tags: string[]
          theme: string
          type: string
        }
        Insert: {
          accepted_answers?: string[] | null
          age_band: string
          choices?: Json | null
          created_at?: string
          difficulty: string
          explanation?: string | null
          family_id?: string | null
          id?: string
          is_builtin?: boolean
          question_text: string
          sentence_template?: string | null
          tags?: string[]
          theme: string
          type: string
        }
        Update: {
          accepted_answers?: string[] | null
          age_band?: string
          choices?: Json | null
          created_at?: string
          difficulty?: string
          explanation?: string | null
          family_id?: string | null
          id?: string
          is_builtin?: boolean
          question_text?: string
          sentence_template?: string | null
          tags?: string[]
          theme?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_questions2_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_sessions: {
        Row: {
          bank_id: string
          family_id: string
          final_scores: Json | null
          finished_at: string | null
          id: string
          mode: string
          started_at: string
          winner_kid_id: string | null
        }
        Insert: {
          bank_id: string
          family_id: string
          final_scores?: Json | null
          finished_at?: string | null
          id?: string
          mode: string
          started_at?: string
          winner_kid_id?: string | null
        }
        Update: {
          bank_id?: string
          family_id?: string
          final_scores?: Json | null
          finished_at?: string | null
          id?: string
          mode?: string
          started_at?: string
          winner_kid_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_sessions_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "quiz_banks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_sessions_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_sessions_winner_kid_id_fkey"
            columns: ["winner_kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_sets: {
        Row: {
          age_band_filter: string | null
          created_at: string
          description: string | null
          emoji: string
          family_id: string | null
          id: string
          max_difficulty: string
          name: string
          question_type_filter: string[] | null
          questions_per_session: number
          themes: string[]
        }
        Insert: {
          age_band_filter?: string | null
          created_at?: string
          description?: string | null
          emoji?: string
          family_id?: string | null
          id?: string
          max_difficulty?: string
          name: string
          question_type_filter?: string[] | null
          questions_per_session?: number
          themes?: string[]
        }
        Update: {
          age_band_filter?: string | null
          created_at?: string
          description?: string | null
          emoji?: string
          family_id?: string | null
          id?: string
          max_difficulty?: string
          name?: string
          question_type_filter?: string[] | null
          questions_per_session?: number
          themes?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "quiz_sets_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      real_asset_prices: {
        Row: {
          asset_type: string
          change_pct: number
          created_at: string
          fx_rate_to_cash: number
          id: string
          market_cap: number | null
          news_body: string | null
          news_headline: string | null
          news_impact: string | null
          news_url: string | null
          prev_close_cents: number
          price_cents: number
          price_date: string
          quote_currency: string
          symbol: string
        }
        Insert: {
          asset_type: string
          change_pct?: number
          created_at?: string
          fx_rate_to_cash?: number
          id?: string
          market_cap?: number | null
          news_body?: string | null
          news_headline?: string | null
          news_impact?: string | null
          news_url?: string | null
          prev_close_cents: number
          price_cents: number
          price_date: string
          quote_currency?: string
          symbol: string
        }
        Update: {
          asset_type?: string
          change_pct?: number
          created_at?: string
          fx_rate_to_cash?: number
          id?: string
          market_cap?: number | null
          news_body?: string | null
          news_headline?: string | null
          news_impact?: string | null
          news_url?: string | null
          prev_close_cents?: number
          price_cents?: number
          price_date?: string
          quote_currency?: string
          symbol?: string
        }
        Relationships: []
      }
      reward_requests: {
        Row: {
          family_id: string
          id: string
          kid_id: string
          parent_note: string | null
          payment_type: string
          points_deducted_at: string | null
          requested_at: string
          resolved_at: string | null
          reward_id: string
          status: string
        }
        Insert: {
          family_id: string
          id?: string
          kid_id: string
          parent_note?: string | null
          payment_type?: string
          points_deducted_at?: string | null
          requested_at?: string
          resolved_at?: string | null
          reward_id: string
          status?: string
        }
        Update: {
          family_id?: string
          id?: string
          kid_id?: string
          parent_note?: string | null
          payment_type?: string
          points_deducted_at?: string | null
          requested_at?: string
          resolved_at?: string | null
          reward_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_requests_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_requests_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_requests_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "rewards"
            referencedColumns: ["id"]
          },
        ]
      }
      rewards: {
        Row: {
          active: boolean
          available_to: string[]
          cost_cash_cents: number
          cost_points: number
          created_at: string
          description: string | null
          family_id: string
          icon: string
          id: string
          kid_id: string | null
          name: string
          recurrence: string
          redemption_limit: number | null
          redemption_period: string
          requires_approval: boolean
          reward_type: string
          type: string
          who: string
        }
        Insert: {
          active?: boolean
          available_to?: string[]
          cost_cash_cents?: number
          cost_points: number
          created_at?: string
          description?: string | null
          family_id: string
          icon?: string
          id?: string
          kid_id?: string | null
          name: string
          recurrence?: string
          redemption_limit?: number | null
          redemption_period?: string
          requires_approval?: boolean
          reward_type?: string
          type: string
          who?: string
        }
        Update: {
          active?: boolean
          available_to?: string[]
          cost_cash_cents?: number
          cost_points?: number
          created_at?: string
          description?: string | null
          family_id?: string
          icon?: string
          id?: string
          kid_id?: string | null
          name?: string
          recurrence?: string
          redemption_limit?: number | null
          redemption_period?: string
          requires_approval?: boolean
          reward_type?: string
          type?: string
          who?: string
        }
        Relationships: [
          {
            foreignKeyName: "rewards_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rewards_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      school_classes: {
        Row: {
          created_at: string
          custom_label: string | null
          day_of_week: number
          end_time: string
          family_id: string
          id: string
          kid_id: string
          room: string | null
          start_time: string
          subject: string
          teacher: string | null
        }
        Insert: {
          created_at?: string
          custom_label?: string | null
          day_of_week: number
          end_time: string
          family_id: string
          id?: string
          kid_id: string
          room?: string | null
          start_time: string
          subject: string
          teacher?: string | null
        }
        Update: {
          created_at?: string
          custom_label?: string | null
          day_of_week?: number
          end_time?: string
          family_id?: string
          id?: string
          kid_id?: string
          room?: string | null
          start_time?: string
          subject?: string
          teacher?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "school_classes_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_classes_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      school_items: {
        Row: {
          active: boolean
          created_at: string
          days_of_week: number[]
          family_id: string
          icon: string
          id: string
          kid_id: string
          name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          days_of_week: number[]
          family_id: string
          icon?: string
          id?: string
          kid_id: string
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          days_of_week?: number[]
          family_id?: string
          icon?: string
          id?: string
          kid_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_items_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_items_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      strikes: {
        Row: {
          cleared_at: string | null
          created_at: string
          deduct_at: string | null
          deducted_at: string | null
          family_id: string | null
          id: string
          issued_by: string
          issued_by_parent_name: string
          kid_id: string
          penalty_cash_cents: number
          penalty_stars: number
          reason: string
        }
        Insert: {
          cleared_at?: string | null
          created_at?: string
          deduct_at?: string | null
          deducted_at?: string | null
          family_id?: string | null
          id?: string
          issued_by?: string
          issued_by_parent_name?: string
          kid_id: string
          penalty_cash_cents?: number
          penalty_stars?: number
          reason: string
        }
        Update: {
          cleared_at?: string | null
          created_at?: string
          deduct_at?: string | null
          deducted_at?: string | null
          family_id?: string | null
          id?: string
          issued_by?: string
          issued_by_parent_name?: string
          kid_id?: string
          penalty_cash_cents?: number
          penalty_stars?: number
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "strikes_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strikes_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      task_completions: {
        Row: {
          cash_awarded_cents: number
          completed_at: string
          date: string
          duration_actual_seconds: number | null
          family_id: string
          family_points_awarded: number
          id: string
          kid_id: string
          parent_approved_at: string | null
          pending_parent_approval: boolean
          points_awarded: number
          task_id: string
        }
        Insert: {
          cash_awarded_cents?: number
          completed_at?: string
          date?: string
          duration_actual_seconds?: number | null
          family_id: string
          family_points_awarded?: number
          id?: string
          kid_id: string
          parent_approved_at?: string | null
          pending_parent_approval?: boolean
          points_awarded?: number
          task_id: string
        }
        Update: {
          cash_awarded_cents?: number
          completed_at?: string
          date?: string
          duration_actual_seconds?: number | null
          family_id?: string
          family_points_awarded?: number
          id?: string
          kid_id?: string
          parent_approved_at?: string | null
          pending_parent_approval?: boolean
          points_awarded?: number
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_completions_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_completions_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_completions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          active: boolean
          cash_value_cents: number
          category: string
          checklist_items: string[] | null
          created_at: string
          custom_label: string | null
          days_of_week: number[]
          default_bpm: number | null
          default_time_signature: string | null
          description: string | null
          duration_minutes: number | null
          end_time: string | null
          family_id: string | null
          family_points_contribution: number
          flexible_min_per_week: number | null
          frequency_per_day: number
          icon: string
          id: string
          is_builtin: boolean
          kid_can_add: boolean
          kid_ids: string[] | null
          location: string | null
          music_enabled: boolean
          name: string
          packing_list: string[] | null
          points: number
          requires_completion: boolean
          requires_parent_approval: boolean
          requires_timer: boolean
          room: string | null
          rule: string
          schedule_type: string
          start_time: string | null
          subject: string | null
          target: string
          target_duration_minutes: number | null
          target_rep_label: string | null
          target_reps: number | null
          teacher: string | null
          time_block: string
          time_slots: string[]
        }
        Insert: {
          active?: boolean
          cash_value_cents?: number
          category: string
          checklist_items?: string[] | null
          created_at?: string
          custom_label?: string | null
          days_of_week?: number[]
          default_bpm?: number | null
          default_time_signature?: string | null
          description?: string | null
          duration_minutes?: number | null
          end_time?: string | null
          family_id?: string | null
          family_points_contribution?: number
          flexible_min_per_week?: number | null
          frequency_per_day?: number
          icon?: string
          id?: string
          is_builtin?: boolean
          kid_can_add?: boolean
          kid_ids?: string[] | null
          location?: string | null
          music_enabled?: boolean
          name: string
          packing_list?: string[] | null
          points?: number
          requires_completion?: boolean
          requires_parent_approval?: boolean
          requires_timer?: boolean
          room?: string | null
          rule?: string
          schedule_type?: string
          start_time?: string | null
          subject?: string | null
          target?: string
          target_duration_minutes?: number | null
          target_rep_label?: string | null
          target_reps?: number | null
          teacher?: string | null
          time_block?: string
          time_slots?: string[]
        }
        Update: {
          active?: boolean
          cash_value_cents?: number
          category?: string
          checklist_items?: string[] | null
          created_at?: string
          custom_label?: string | null
          days_of_week?: number[]
          default_bpm?: number | null
          default_time_signature?: string | null
          description?: string | null
          duration_minutes?: number | null
          end_time?: string | null
          family_id?: string | null
          family_points_contribution?: number
          flexible_min_per_week?: number | null
          frequency_per_day?: number
          icon?: string
          id?: string
          is_builtin?: boolean
          kid_can_add?: boolean
          kid_ids?: string[] | null
          location?: string | null
          music_enabled?: boolean
          name?: string
          packing_list?: string[] | null
          points?: number
          requires_completion?: boolean
          requires_parent_approval?: boolean
          requires_timer?: boolean
          room?: string | null
          rule?: string
          schedule_type?: string
          start_time?: string | null
          subject?: string | null
          target?: string
          target_duration_minutes?: number | null
          target_rep_label?: string | null
          target_reps?: number | null
          teacher?: string | null
          time_block?: string
          time_slots?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "tasks_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      themes: {
        Row: {
          accent: string
          accent_soft: string
          decoration: string
          description: string | null
          flavor: string
          header_gradient: string
          heading_text: string
          id: string
          name: string
          page_gradient: string
        }
        Insert: {
          accent: string
          accent_soft: string
          decoration: string
          description?: string | null
          flavor: string
          header_gradient: string
          heading_text: string
          id: string
          name: string
          page_gradient: string
        }
        Update: {
          accent?: string
          accent_soft?: string
          decoration?: string
          description?: string | null
          flavor?: string
          header_gradient?: string
          heading_text?: string
          id?: string
          name?: string
          page_gradient?: string
        }
        Relationships: []
      }
      trading_asset_prices: {
        Row: {
          event_pct: number | null
          generated_at: string
          id: string
          news_body: string | null
          news_headline: string | null
          news_impact: string | null
          price_date: string
          price_nuggets: number
          symbol: string
        }
        Insert: {
          event_pct?: number | null
          generated_at?: string
          id?: string
          news_body?: string | null
          news_headline?: string | null
          news_impact?: string | null
          price_date?: string
          price_nuggets: number
          symbol: string
        }
        Update: {
          event_pct?: number | null
          generated_at?: string
          id?: string
          news_body?: string | null
          news_headline?: string | null
          news_impact?: string | null
          price_date?: string
          price_nuggets?: number
          symbol?: string
        }
        Relationships: []
      }
      trading_holdings: {
        Row: {
          asset_symbol: string
          avg_cost_nuggets: number
          created_at: string
          family_id: string
          id: string
          kid_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          asset_symbol: string
          avg_cost_nuggets?: number
          created_at?: string
          family_id: string
          id?: string
          kid_id: string
          quantity?: number
          updated_at?: string
        }
        Update: {
          asset_symbol?: string
          avg_cost_nuggets?: number
          created_at?: string
          family_id?: string
          id?: string
          kid_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trading_holdings_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trading_holdings_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      trading_portfolios: {
        Row: {
          created_at: string
          family_id: string
          id: string
          kid_id: string
          nuggets_balance: number
          total_deposited_stars: number
          total_withdrawn_stars: number
        }
        Insert: {
          created_at?: string
          family_id: string
          id?: string
          kid_id: string
          nuggets_balance?: number
          total_deposited_stars?: number
          total_withdrawn_stars?: number
        }
        Update: {
          created_at?: string
          family_id?: string
          id?: string
          kid_id?: string
          nuggets_balance?: number
          total_deposited_stars?: number
          total_withdrawn_stars?: number
        }
        Relationships: [
          {
            foreignKeyName: "trading_portfolios_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trading_portfolios_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: true
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      trading_transactions: {
        Row: {
          asset_symbol: string | null
          created_at: string
          family_id: string
          fee_nuggets: number
          id: string
          kid_id: string
          price_nuggets: number | null
          quantity: number | null
          total_nuggets: number
          type: string
        }
        Insert: {
          asset_symbol?: string | null
          created_at?: string
          family_id: string
          fee_nuggets?: number
          id?: string
          kid_id: string
          price_nuggets?: number | null
          quantity?: number | null
          total_nuggets: number
          type: string
        }
        Update: {
          asset_symbol?: string | null
          created_at?: string
          family_id?: string
          fee_nuggets?: number
          id?: string
          kid_id?: string
          price_nuggets?: number | null
          quantity?: number | null
          total_nuggets?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "trading_transactions_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trading_transactions_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
        ]
      }
      wishlist_items: {
        Row: {
          added_at: string
          id: string
          kid_id: string
          position: number
          reward_id: string
        }
        Insert: {
          added_at?: string
          id?: string
          kid_id: string
          position: number
          reward_id: string
        }
        Update: {
          added_at?: string
          id?: string
          kid_id?: string
          position?: number
          reward_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlist_items_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlist_items_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "rewards"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      count_unread_messages: { Args: { p_kid_id: string }; Returns: number }
      current_family_id: { Args: never; Returns: string }
      decrement_kid_points: {
        Args: { p_amount: number; p_kid_id: string }
        Returns: undefined
      }
      decrement_kid_stars: {
        Args: { p_amount: number; p_kid_id: string }
        Returns: undefined
      }
      founder_count: { Args: never; Returns: number }
      get_current_family_kid_ids: { Args: never; Returns: string[] }
      increment_badge_progress: {
        Args: { p_category: string; p_kid_id: string }
        Returns: string
      }
      increment_custom_badge_progress: {
        Args: {
          p_badge_id: string
          p_family_id: string
          p_kid_id: string
          p_today: string
        }
        Returns: string
      }
      increment_family_points: {
        Args: { p_amount: number; p_kid_id: string }
        Returns: undefined
      }
      increment_kid_cash: {
        Args: { p_amount_cents: number; p_kid_id: string }
        Returns: undefined
      }
      increment_kid_points: {
        Args: { p_amount: number; p_kid_id: string }
        Returns: undefined
      }
      increment_kid_total_completions: {
        Args: { p_kid_id: string }
        Returns: undefined
      }
      update_kid_gamification: {
        Args: { p_kid_id: string; p_points: number }
        Returns: undefined
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
