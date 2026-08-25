ALTER TABLE rooms
    DROP INDEX idx_rooms_status,
    DROP COLUMN status;

ALTER TABLE objects
    DROP INDEX idx_objects_status,
    DROP COLUMN status;
