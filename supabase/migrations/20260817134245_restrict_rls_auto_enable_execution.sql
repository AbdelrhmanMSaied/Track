-- Platform security — keep the event-trigger helper internal.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
