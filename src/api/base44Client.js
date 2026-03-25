// src/api/base44Client.js
// Replaces Base44 SDK with direct Supabase + Vercel API calls
// Drop-in replacement — same interface as before

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ── TABLE NAME MAPPING ────────────────────────────────────────────────────────
// Maps Base44 entity names to Supabase table names

const TABLE_MAP = {
  'Trade': 'trades',
  'Position': 'positions',
  'StrategySettings': 'strategy_settings',
  'TradingMode': 'trading_mode',
  'ConsensusScore': 'consensus_scores',
  'ARKSignal': 'ark_signals',
  'CongressSignal': 'congress_signals',
  'SentimentSignal': 'sentiment_signals',
  'AISignal': 'ai_signals',
  'CongressTrade': 'congress_trades',
  'BacktestRun': 'backtest_runs',
  'BacktestTrade': 'backtest_trades',
  'NotificationLog': 'notification_logs',
  'WatchlistItem': 'watchlist_items',
  'DebugLog': 'debug_logs',
};

// ── ENTITY HELPER ─────────────────────────────────────────────────────────────
// Creates a Base44-compatible entity interface backed by Supabase

function createEntity(entityName) {
  const table = TABLE_MAP[entityName];
  if (!table) {
    console.error(`Unknown entity: ${entityName}. Add it to TABLE_MAP.`);
  }

  return {
    // list(sortField, limit) — matches Base44's .list('-created_date', 10)
    async list(sortField = '-created_date', limit = 1000) {
      let query = supabase.from(table).select('*');

      if (sortField) {
        const descending = sortField.startsWith('-');
        const field = sortField.replace(/^-/, '');
        query = query.order(field, { ascending: !descending });
      }

      if (limit) {
        query = query.limit(limit);
      }

      const { data, error } = await query;
      if (error) throw new Error(`${entityName}.list error: ${error.message}`);
      return data || [];
    },

    // get(id) — fetch single record by ID
    async get(id) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw new Error(`${entityName}.get error: ${error.message}`);
      return data;
    },

    // create(payload) — insert new record
    async create(payload) {
      const { data, error } = await supabase
        .from(table)
        .insert(payload)
        .select()
        .single();
      if (error) throw new Error(`${entityName}.create error: ${error.message}`);
      return data;
    },

    // update(id, payload) — update existing record
    async update(id, payload) {
      const { data, error } = await supabase
        .from(table)
        .update(payload)
        .eq('id', id)
        .select()
        .single();
      if (error) throw new Error(`${entityName}.update error: ${error.message}`);
      return data;
    },

    // delete(id) — delete record
    async delete(id) {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('id', id);
      if (error) throw new Error(`${entityName}.delete error: ${error.message}`);
      return true;
    },

    // filter(conditions) — filter by field values
    async filter(conditions = {}) {
      let query = supabase.from(table).select('*');
      for (const [key, value] of Object.entries(conditions)) {
        query = query.eq(key, value);
      }
      const { data, error } = await query;
      if (error) throw new Error(`${entityName}.filter error: ${error.message}`);
      return data || [];
    },
  };
}

// ── FUNCTIONS HELPER ──────────────────────────────────────────────────────────
// Calls Vercel API endpoints instead of Base44 functions

const functions = {
  async invoke(functionName, payload = {}) {
    try {
      const url = `/api/${functionName}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.status === 404) {
        throw new Error(`Function ${functionName} not found at ${url} NOT_FOUND`);
      }
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Function ${functionName} failed: ${err}`);
      }
      const data = await res.json();
      return { data };
    } catch (error) {
      console.error(`Function invoke error (${functionName}):`, error);
      throw error;
    }
  }
};

// ── AUTH HELPER ───────────────────────────────────────────────────────────────
// Simple auth using Supabase

const auth = {
  async me() {
    const { data: { user } } = await supabase.auth.getUser();
    return user || { id: 'anonymous', role: 'admin' }; // Default for single-user app
  },

  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }
};

// ── MAIN CLIENT EXPORT ────────────────────────────────────────────────────────
// Drop-in replacement for Base44's createClient

export const base44 = {
  entities: {
    Trade: createEntity('Trade'),
    Position: createEntity('Position'),
    StrategySettings: createEntity('StrategySettings'),
    TradingMode: createEntity('TradingMode'),
    ConsensusScore: createEntity('ConsensusScore'),
    ARKSignal: createEntity('ARKSignal'),
    CongressSignal: createEntity('CongressSignal'),
    SentimentSignal: createEntity('SentimentSignal'),
    AISignal: createEntity('AISignal'),
    CongressTrade: createEntity('CongressTrade'),
    BacktestRun: createEntity('BacktestRun'),
    BacktestTrade: createEntity('BacktestTrade'),
    NotificationLog: createEntity('NotificationLog'),
    WatchlistItem: createEntity('WatchlistItem'),
    DebugLog: createEntity('DebugLog'),
  },
  functions,
  auth,
};

export default base44;
