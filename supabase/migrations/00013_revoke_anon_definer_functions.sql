-- Revoke anonymous access to security-definer functions.
-- Supabase exposes every public function over /rest/v1/rpc, and new functions are executable by
-- PUBLIC and anon by default. These eight check auth.uid() internally, but a logged-out caller
-- should not reach them at all (advisor lint anon_security_definer_function_executable).
--
-- No logged-out path needs any of them: every call site in apps/web uses the user-session server
-- client behind requireUser/auth, and the invite page (/join/[token]) reads nothing from the
-- database until the visitor is signed in. RLS policies call is_trip_member/is_trip_planner as the
-- querying role, so authenticated keeps EXECUTE; anon has no legitimate query on those tables.
-- service_role keeps its own default grant.

revoke execute on function public.booking_confirmation_code(uuid) from public, anon;
grant execute on function public.booking_confirmation_code(uuid) to authenticated;

revoke execute on function public.create_trip(text, text, date, date, text, text, text, jsonb) from public, anon;
grant execute on function public.create_trip(text, text, date, date, text, text, text, jsonb) to authenticated;

revoke execute on function public.is_trip_member(uuid) from public, anon;
grant execute on function public.is_trip_member(uuid) to authenticated;

revoke execute on function public.is_trip_planner(uuid) from public, anon;
grant execute on function public.is_trip_planner(uuid) to authenticated;

revoke execute on function public.join_trip(text, text) from public, anon;
grant execute on function public.join_trip(text, text) to authenticated;

revoke execute on function public.trip_directory(uuid) from public, anon;
grant execute on function public.trip_directory(uuid) to authenticated;

revoke execute on function public.trip_inbound_code(uuid) from public, anon;
grant execute on function public.trip_inbound_code(uuid) to authenticated;

-- handle_new_user is only ever fired by the on_auth_user_created trigger on auth.users. Postgres
-- checks EXECUTE on a trigger function when the trigger is created, not when it fires, so no role
-- needs the privilege and nothing is granted back.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
