-- Official routes are always shown. Affiliate fallbacks stay null until each program
-- approves us; the founder fills affiliate_label, affiliate_url, and affiliate_disclosure then.
insert into public.travel_admin_partner_routes
  (kind, official_label, official_url, official_note, routine_processing_days, expedited_processing_days, processing_source_url)
values
  ('passport', 'Renew online with the U.S. State Department',
   'https://travel.state.gov/content/travel/en/passports/have-passport/renew-online.html',
   'For adults 25 and older renewing a 10-year passport. Routine takes 6–8 weeks; expedited takes 2–3 weeks.',
   56, 21, 'https://travel.state.gov/content/travel/en/passports/how-apply/processing-times.html'),
  ('real_id', 'Check your state’s REAL ID requirements', 'https://www.tsa.gov/realid', null, null, null, null),
  ('global_entry', 'Apply through CBP Trusted Traveler Programs', 'https://ttp.dhs.gov/', null, null, null, null),
  ('tsa_precheck', 'Enroll with a TSA PreCheck enrollment provider', 'https://www.tsa.gov/precheck', null, null, null, null)
on conflict (kind) do nothing;
