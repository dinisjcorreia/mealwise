-- Read-only diagnostics. Run each query SEPARATELY in project dpcakoopjncincfucflv.
-- Repeat for every project in the restricted organization: usage is shared.
select bucket_id, count(*) as objects,
       round(sum(coalesce((metadata->>'size')::bigint, 0)) / 1000000.0, 2) as size_mb
from storage.objects
group by bucket_id
order by size_mb desc;

-- Largest objects, to distinguish avatars from unrelated assets.
select bucket_id, name,
       round(coalesce((metadata->>'size')::bigint, 0) / 1000000.0, 2) as size_mb,
       created_at
from storage.objects
order by coalesce((metadata->>'size')::bigint, 0) desc
limit 30;

-- Referenced vs. unused meal photos. One-day grace excludes uploads in flight.
select exists(select 1 from public.meals m where m.photo_path = o.name) as referenced,
       count(*) as objects,
       round(sum(coalesce((o.metadata->>'size')::bigint, 0)) / 1000000.0, 2) as size_mb
from storage.objects o
where o.bucket_id = 'meal-photos' and o.created_at < now() - interval '1 day'
group by referenced;

-- Review cleanup candidates. Never delete Storage rows via SQL.
-- Remove confirmed unused files through Storage UI/API, not the SQL editor.
select o.name,
       round(coalesce((o.metadata->>'size')::bigint, 0) / 1000000.0, 2) as size_mb
from storage.objects o
where o.bucket_id = 'meal-photos' and o.created_at < now() - interval '1 day'
  and not exists(select 1 from public.meals m where m.photo_path = o.name)
order by coalesce((o.metadata->>'size')::bigint, 0) desc;
