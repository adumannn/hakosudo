-- Existing premium skin rows should match the one-dollar Stripe prices.
update public.skins
   set price_cents = 100
 where slug in ('sumi-e', 'indigo');
