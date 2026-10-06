-- Run manually AFTER deploying photo compression, to avoid blocking old clients.
-- Existing photos are preserved; lowering this limit does not shrink them.
update storage.buckets
set file_size_limit = 524288,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'meal-photos';
