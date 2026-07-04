-- ============================================================================
-- Migration: move Counter Box to shops table (it's a GLOBAL running total,
-- not a per-day value — matches v15's design where Counter Box survives
-- day rollover, unlike Day Box which resets every day).
-- Run once in: Supabase Dashboard → SQL Editor → New Query → paste → Run
-- ============================================================================

alter table shops add column if not exists counter_box     numeric(10,2) default 0;
alter table shops add column if not exists counter_box_det jsonb;

-- The old daily.counter_box column is no longer used going forward.
-- Left in place (not dropped) in case you have historical reports reading it.
-- Safe to drop later with: alter table daily drop column counter_box;
