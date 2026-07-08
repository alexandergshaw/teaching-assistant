-- Associate a course with an institution (the acronym registered in the app,
-- e.g. MCC/MPCC). Nullable; used to group/filter courses in the Courses hub.
alter table public.course_hub add column if not exists institution text;
