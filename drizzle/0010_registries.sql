-- Installed idempotently by the registry service; retained as schema history.
CREATE TABLE IF NOT EXISTS mimipip_registries (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, title TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('baby','gift')),
 occasion TEXT NOT NULL, event_date TEXT NOT NULL DEFAULT '', message TEXT NOT NULL DEFAULT '',
 delivery TEXT NOT NULL, closed INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS mimipip_registry_owner ON mimipip_registries(owner_id);

CREATE TABLE IF NOT EXISTS mimipip_registry_items (
 id TEXT PRIMARY KEY, registry_id TEXT NOT NULL REFERENCES mimipip_registries(id), selection TEXT NOT NULL,
 quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 99), favourite INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS mimipip_registry_items_parent ON mimipip_registry_items(registry_id);

CREATE INDEX IF NOT EXISTS mimipip_registry_order_item ON mimipip_orders(json_extract(fulfilment,'$.registry.itemId'),status);

CREATE TRIGGER IF NOT EXISTS mimipip_registry_reserve BEFORE INSERT ON mimipip_orders
 WHEN json_extract(NEW.fulfilment,'$.registry.itemId') IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS (
 SELECT 1 FROM mimipip_registry_items i JOIN mimipip_registries r ON r.id=i.registry_id
 WHERE i.id=json_extract(NEW.fulfilment,'$.registry.itemId') AND r.id=json_extract(NEW.fulfilment,'$.registry.code') AND r.closed=0
 AND i.quantity > COALESCE((SELECT SUM(json_extract(o.fulfilment,'$.registry.quantity')) FROM mimipip_orders o
 WHERE json_extract(o.fulfilment,'$.registry.itemId')=i.id AND o.status IN ('creating','pending','paid','review')),0)
 ) OR json_extract(NEW.fulfilment,'$.registry.quantity')!=1 THEN RAISE(ABORT,'registry_gift_unavailable') END;
 END;

CREATE TRIGGER IF NOT EXISTS mimipip_registry_item_delete BEFORE DELETE ON mimipip_registry_items
 WHEN EXISTS(SELECT 1 FROM mimipip_orders WHERE json_extract(fulfilment,'$.registry.itemId')=OLD.id AND status IN ('creating','pending','paid','review'))
 BEGIN SELECT RAISE(ABORT,'registry_gift_reserved'); END;
