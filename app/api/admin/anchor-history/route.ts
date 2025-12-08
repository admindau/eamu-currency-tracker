// app/api/admin/anchor-history/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

type WindowKey = '90d' | '365d' | 'all';

const DEFAULT_PAIR = 'USD/SSP';
const DEFAULT_WINDOW: WindowKey = '365d';

function parseWindowParam(raw: string | null): WindowKey {
  if (!raw) return DEFAULT_WINDOW;
  const v = raw.toLowerCase();
  if (v === '90d' || v === '365d' || v === 'all') return v;
  return DEFAULT_WINDOW;
}

/**
 * Returns a YYYY-MM-DD string for the lower bound of the window,
 * or null if we should return all available history.
 */
function getFromDateForWindow(window: WindowKey): string | null {
  if (window === 'all') return null;

  const days = window === '90d' ? 90 : 365;
  const now = new Date();
  now.setDate(now.getDate() - days);
  return now.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  // ✅ FIX: supabaseServer is already a client instance, not a function
  const supabase = supabaseServer;

  const url = new URL(req.url);
  const searchParams = url.searchParams;

  const pairParam = searchParams.get('pair') ?? DEFAULT_PAIR;
  const windowParam = parseWindowParam(searchParams.get('window'));

  const [base, quote] = pairParam.split('/');

  if (!base || !quote) {
    return NextResponse.json(
      { error: 'Invalid pair. Expected something like "USD/SSP".' },
      { status: 400 },
    );
  }

  // Base query against fx_daily_rates_default: this view already joins fx_sources
  // and exposes whether the row is a manual override.
  let query = supabase
    .from('fx_daily_rates_default')
    .select(
      'as_of_date, rate_mid, is_manual_override, is_official, source_label',
    )
    .eq('base_currency', base)
    .eq('quote_currency', quote)
    .order('as_of_date', { ascending: true });

  const fromDate = getFromDateForWindow(windowParam);
  if (fromDate) {
    query = query.gte('as_of_date', fromDate);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error loading anchor history:', error);
    return NextResponse.json(
      {
        error: 'Failed to load anchor history',
        details: error.message,
      },
      { status: 500 },
    );
  }

  const rows = data ?? [];

  // Normalised points for AdminAnalyticsCard
  const points = rows.map((row: any) => ({
    // date fields
    as_of_date: row.as_of_date,
    value_date: row.as_of_date,
    date: row.as_of_date,

    // rate fields
    rate_mid: row.rate_mid,
    mid_rate: row.rate_mid,
    value: row.rate_mid,
    mid: row.rate_mid,

    // flags
    is_manual_override: row.is_manual_override ?? false,
    is_manual: row.is_manual_override ?? false,
    is_override: row.is_manual_override ?? false,
    is_official_override: row.is_manual_override ?? false,
    is_official: row.is_official ?? false,

    // source / origin
    source_label: row.source_label ?? null,
    source_name: row.source_label ?? null,
    source: row.source_label ?? null,
    origin: row.source_label ?? null,
    provider: row.source_label ?? null,
  }));

  const totalPoints = points.length;
  const overrideDays = points.filter((p) => p.is_manual_override).length;

  const firstDate = totalPoints > 0 ? points[0].as_of_date : null;
  const lastDate =
    totalPoints > 0 ? points[totalPoints - 1].as_of_date : null;

  const windowLabel =
    windowParam === 'all'
      ? 'All available history'
      : windowParam === '90d'
      ? 'Last 90 days'
      : 'Last 365 days';

  return NextResponse.json({
    pair: `${base}/${quote}`,
    window: {
      key: windowParam,
      label: windowLabel,
      from: fromDate,
      to: lastDate,
    },
    points,
    stats: {
      total_points: totalPoints,
      override_days: overrideDays,
      first_date: firstDate,
      last_date: lastDate,
    },
  });
}
