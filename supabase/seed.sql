-- Seed featured destinations
insert into public.destinations (name, country, teaser, flight_cost, hotel_cost, activity_cost, transfer_cost, partner_fee, is_featured) values
  ('Tokyo Pulse', 'Japan', 'Neon-lit nights, ancient temples, and street food that changes your life.', 1200, 800, 400, 150, 50, true),
  ('Paris Afterglow', 'France', 'Golden hour over the Seine, hidden wine bars, and rooftop views.', 900, 1000, 350, 100, 50, true),
  ('Bali Drift', 'Indonesia', 'Rice terraces at dawn, jungle villas, and surf breaks at sunset.', 1100, 600, 300, 80, 50, true);

-- Seed default assist policy rules
insert into public.assist_policy_rules (name, applies_to_source, applies_to_kinds, minimum_severity, allowed_action, requires_auto_rebook, requires_credit_protection) values
  ('Auto-rebook on flight delay (medium+)', 'flight', '{delayed,canceled}', 'medium', 'auto_rebook', true, false),
  ('Protect credit on flight cancellation', 'flight', '{canceled}', 'low', 'protect_credit', false, true),
  ('Escalate hotel overbooking', 'hotel', '{overbooked}', 'medium', 'escalate', false, false),
  ('Auto-rebook on connection risk', 'flight', '{connection_risk}', 'high', 'auto_rebook', true, false);

-- Seed travel admin partner routes
insert into public.travel_admin_partner_routes (document_type, partner_name, mode, action_url) values
  ('passport', 'DocuTravel', 'referral', 'https://docutravel.example.com/apply'),
  ('tsa_pre_check', 'FastLane', 'api', 'https://api.fastlane.example.com/v1/apply'),
  ('global_entry', 'BorderFlow', 'referral', 'https://borderflow.example.com/enroll');
