-- supabase/migrations/0013_freeze_rpcs_auth_check.sql
-- Defense-in-depth: the security-definer freeze RPCs are granted to
-- `authenticated`, so any logged-in user can call them directly via the
-- Supabase JS client. Add an explicit caller-identity check so a user can
-- only operate on their own row, regardless of how the RPC is invoked.
-- The API routes still call these with the user's own id, so this is
-- additive — it only blocks one user from operating on another's data.

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
    balance := coalesce(v_balance, 0);
    granted := 0;
    return next;
    return;
  end if;

  update public.profiles
     set freeze_credits = freeze_credits + p_quantity
   where id = p_user_id
   returning freeze_credits into v_balance;
  balance := v_balance;
  granted := p_quantity;
  return next;
end
$$;

create or replace function public.consume_freeze_credit(
  p_user_id uuid,
  p_date date,
  p_granted_month date
) returns int
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

  update public.profiles
     set freeze_credits = freeze_credits - 1
   where id = p_user_id and freeze_credits > 0
   returning freeze_credits into v_balance;

  if v_balance is null then
    return -1;
  end if;

  begin
    insert into public.streak_freezes (user_id, date, granted_month)
    values (p_user_id, p_date, p_granted_month);
  exception when unique_violation then
    update public.profiles
       set freeze_credits = freeze_credits + 1
     where id = p_user_id
     returning freeze_credits into v_balance;
    return -1;
  end;

  return v_balance;
end
$$;
