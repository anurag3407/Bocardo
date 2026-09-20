# 20 — Database Optimization & Maintenance

## Already Tuned (`infra/postgres/postgresql.conf`)

SSD planner costs, `shared_buffers=1GB`, parallel workers, WAL sizing, `pg_stat_statements` preloaded, IST timezone, slow-query log at 500ms. The API additionally logs any query >500ms in dev.

## Post-Install One-Time

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
ANALYZE;  -- refresh planner stats after seeding
```

## The Queries That Matter (and their indexes)

| Hot query | Index | Expected |
|---|---|---|
| Nearby restaurants (ST_DWithin 7km) | GiST `idx_restaurants_location` | <10ms @100k |
| Nearest rider dispatch | GiST on `last_location` + `is_online/active_order_id` partial | <15ms |
| Customer order history | `idx_orders_customer (customer_id, created_at DESC)` | <5ms |
| KOT feed | `idx_orders_restaurant (restaurant_id, status)` | <5ms |
| Stale-payment sweep | partial `idx_orders_pending_sweep` | ms (tiny scan) |
| Abandon reaper | partial `idx_orders_active_delivery_sweep` | ms |

## Weekly Maintenance (cron on VPS)

```cron
# /etc/cron.d/bocardo-db (runs inside the postgres container)
15 3 * * 0  root docker compose -f /opt/bocardo/docker-compose.prod.yml exec -T postgres psql -U bocardo -d bocardo -c "VACUUM (ANALYZE) orders, order_items, rider_profiles;"
30 3 1 * *  root docker compose -f /opt/bocardo/docker-compose.prod.yml exec -T postgres psql -U bocardo -d bocardo -c "REINDEX INDEX CONCURRENTLY idx_restaurants_location;"
```

(Autovacuum handles the rest; these target the highest-churn tables.)

## Finding Slow Queries

```sql
SELECT calls, round(mean_exec_time::numeric,1) ms, query
FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 15;
```

## Refreshing the Recommendation Matrix

```sql
-- Co-occurrence: run nightly (or after big order days)
INSERT INTO dish_pair_associations (dish_id_a, dish_id_b, co_occurrence_count)
SELECT a.dish_id, b.dish_id, COUNT(*)
FROM order_items a
JOIN order_items b ON a.order_id = b.order_id AND a.dish_id < b.dish_id
JOIN orders o ON o.id = a.order_id AND o.status = 'DELIVERED'
GROUP BY 1,2
ON CONFLICT (dish_id_a, dish_id_b)
DO UPDATE SET co_occurrence_count = EXCLUDED.co_occurrence_count;
```

## Growth Thresholds — Act When You See

| Signal | Threshold | Action |
|---|---|---|
| DB CPU (GCP monitoring) | >60% daily avg | Move DB to dedicated e2-highmem-2 or Cloud SQL |
| Connections | >150 | PgBouncer transaction pooling |
| `orders` table | >10M rows | Partition by month (`RANGE created_at`) |
| pg_data disk | >70% of 80GB | Resize PD online (`gcloud compute disks resize`) |
| p95 `order.create` | >800ms | Read replica for recommendation queries |
