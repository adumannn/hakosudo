-- supabase/migrations/0014_grant_freeze_credits_profile_check.sql
-- If profiles has no row for p_user_id, the insert into freeze_purchases
-- still succeeds (FK is to auth.users, not profiles), the profile update
-- affects 0 rows, and v_balance is NULL. Without an explicit guard the RPC
-- returns success with NULL balance, locking in the session_id as "granted"
-- on a user who has no credit row. Raise so the transaction rolls back.

create or replace function public.grant_freeze_credits(
  p_user_id uuid,
  p_session_id text,
  p_sku text,
  p_quantity int,
  p_amount_cents int
) returns table(balance int, granted int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance int;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.freeze_purchases (user_id, stripe_session_id, sku, quantity, amount_cents)
  values (p_user_id, p_session_id, p_sku, p_quantity, p_amount_cents)
  on conflict (stripe_session_id) do nothing;

  if not found then
    select freeze_credits into v_balance from public.profiles where id = p_user_id;
    if v_balance is null then
      raise exception 'profile-not-found' using errcode = 'P0001';
    end if;
    balance := v_balance;
    granted := 0;
    return next;
    return;
  end if;

  update public.profiles
     set freeze_credits = freeze_credits + p_quantity
   where id = p_user_id
   returning freeze_credits into v_balance;
  if v_balance is null then
    raise exception 'profile-not-found' using errcode = 'P0001';
  end if;
  balance := v_balance;
  granted := p_quantity;
  return next;
end
$$;
