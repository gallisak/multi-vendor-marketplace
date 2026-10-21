\pset footer off
\echo 'Auction invariants (latest load test lot)'
WITH lot AS (
  SELECT a.*
  FROM auctions a
  JOIN products p ON p.id = a.product_id
  WHERE p.title LIKE 'Load test auction%'
  ORDER BY a.created_at DESC
  LIMIT 1
),
ordered AS (
  SELECT
    b.amount_minor,
    lag(b.amount_minor) OVER (ORDER BY b.amount_minor) AS previous_amount
  FROM bids b
  WHERE b.auction_id = (SELECT id FROM lot)
)
SELECT
  (SELECT bid_count FROM lot) AS auction_bid_count,
  (SELECT count(*) FROM ordered) AS stored_bids,
  (SELECT current_price_minor FROM lot) AS current_price_minor,
  (SELECT max(amount_minor) FROM ordered) AS highest_bid_minor,
  (SELECT count(*) FROM ordered
     WHERE previous_amount IS NOT NULL
       AND amount_minor < previous_amount + (SELECT bid_step_minor FROM lot)) AS step_violations,
  (SELECT count(*) - count(DISTINCT amount_minor) FROM ordered) AS duplicate_amounts,
  (SELECT version FROM lot) AS row_version;

\echo 'Stock invariants (latest load test product)'
WITH item AS (
  SELECT p.*
  FROM products p
  WHERE p.title LIKE 'Load test limited stock%'
  ORDER BY p.created_at DESC
  LIMIT 1
)
SELECT
  (SELECT stock FROM item) AS stock_left,
  (SELECT status FROM item) AS status,
  (SELECT coalesce(sum(oi.quantity), 0) FROM order_items oi WHERE oi.product_id = (SELECT id FROM item))
    AS units_sold,
  (SELECT count(DISTINCT o.id)
     FROM orders o
     JOIN seller_orders so ON so.order_id = o.id
     JOIN order_items oi ON oi.seller_order_id = so.id
     WHERE oi.product_id = (SELECT id FROM item)) AS orders,
  (SELECT count(*) FROM (
     SELECT o.buyer_id
     FROM orders o
     JOIN seller_orders so ON so.order_id = o.id
     JOIN order_items oi ON oi.seller_order_id = so.id
     WHERE oi.product_id = (SELECT id FROM item)
     GROUP BY o.buyer_id HAVING count(*) > 1) duplicates) AS buyers_with_two_orders;
