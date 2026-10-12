-- Batas poin tier diubah dari Settings → Membership & poin.
create policy "admin write tiers" on membership_tiers
  for update using (has_permission('settings', 'edit')) with check (has_permission('settings', 'edit'));
