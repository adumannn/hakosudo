-- supabase/migrations/0012_freeze_credits.sql
-- Paid freeze credits: counter on profiles + purchase log + atomicity RPCs.

alter table public.profiles
  add column freeze_credits int not null default 0
  check (freeze_credits >= 0);

create table public.freeze_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_session_id text not null unique,
  sku text not null,
  quantity int not null check (quantity > 0),
  amount_cents int not null check (amount_cents >= 0),
  created_at timestamptz not null default now()
);

create index freeze_purchases_user_idx
  on public.freeze_purchases(user_id, created_at desc);

alter table public.freeze_purchases enable row level security;

create policy fp_owner_select on public.freeze_purchases for select
  using (auth.uid() = user_id);
-- No insert/update/delete policy: writes happen via the security-definer RPC below.

-- Grant credits atomically. Idempotent on stripe_session_id.
-- Returns (balance, granted) where granted is 0 on replay, p_quantity on first call.
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

-- Consume one credit and insert the streak_freezes row atomically.
-- Returns new balance, or -1 if no credits available or the date is already frozen.
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

grant execute on function public.grant_freeze_credits(uuid, text, text, int, int) to authenticated;
grant execute on function public.consume_freeze_credit(uuid, date, date) to authenticated;
