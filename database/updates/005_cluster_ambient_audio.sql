ALTER TABLE room_clusters
    ADD COLUMN ambient_sound_id INT UNSIGNED NULL AFTER description,
    ADD COLUMN ambient_volume TINYINT UNSIGNED NOT NULL DEFAULT 35 AFTER ambient_sound_id,
    ADD KEY idx_room_clusters_ambient_sound (ambient_sound_id),
    ADD CONSTRAINT fk_room_clusters_ambient_sound FOREIGN KEY (ambient_sound_id) REFERENCES sounds (id) ON DELETE SET NULL;
