-- Raise the course-files bucket's own per-file cap so large LMS exports fit;
-- the project-wide upload limit (Storage settings) still applies and must be
-- raised in the dashboard to exceed 50 MB. Idempotent.
update storage.buckets set file_size_limit = 209715200 where id = 'course-files';
