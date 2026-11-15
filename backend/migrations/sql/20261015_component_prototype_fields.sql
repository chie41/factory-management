BEGIN;
ALTER TABLE components ADD COLUMN image_url text;
ALTER TABLE components ADD COLUMN description text;
ALTER TABLE components ADD COLUMN status varchar(30) NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE'));
COMMIT;
