
REVOKE ALL ON FUNCTION public.create_orchestration_task(public.orchestration_task_type, TEXT, TEXT, public.orchestration_task_priority, TEXT, UUID, UUID, UUID, UUID, NUMERIC, TEXT, TEXT[], TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_task(UUID, UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.escalate_task(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_orchestration_task(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_orchestration_task(public.orchestration_task_type, TEXT, TEXT, public.orchestration_task_priority, TEXT, UUID, UUID, UUID, UUID, NUMERIC, TEXT, TEXT[], TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.assign_task(UUID, UUID, TEXT, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.escalate_task(UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_orchestration_task(UUID, TEXT, UUID) TO service_role;
