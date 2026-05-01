ALTER TABLE public.release_review_queue
  DROP CONSTRAINT IF EXISTS rrq_status_check;

ALTER TABLE public.release_review_queue
  ADD CONSTRAINT rrq_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'claimed'::text,
    'processing'::text,
    'failed'::text,
    'released'::text,
    'refunded'::text,
    'held'::text,
    'dismissed'::text,
    'awaiting_info'::text,
    'resolved'::text,
    'cancelled'::text
  ]));

-- The unique-open constraint should treat all "in-flight" statuses as open,
-- not just pending/claimed, so we don't let a tx accumulate parallel queue rows
-- while it's processing or awaiting more info.
DROP INDEX IF EXISTS public.rrq_unique_open_per_type;
CREATE UNIQUE INDEX rrq_unique_open_per_type
  ON public.release_review_queue (transaction_id, queue_type)
  WHERE status IN ('pending','claimed','processing','awaiting_info','held');