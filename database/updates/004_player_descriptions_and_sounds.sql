ALTER TABLE rooms
    ADD COLUMN player_description TEXT NULL AFTER description;

ALTER TABLE objects
    ADD COLUMN player_description TEXT NULL AFTER description;

CREATE TABLE sounds (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(160) NOT NULL,
    slug VARCHAR(190) NOT NULL,
    asset_path VARCHAR(500) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size INT UNSIGNED NOT NULL DEFAULT 0,
    original_filename VARCHAR(255) NULL,
    created_by INT UNSIGNED NOT NULL,
    updated_by INT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sounds_slug (slug),
    KEY idx_sounds_name (name),
    CONSTRAINT fk_sounds_created_by FOREIGN KEY (created_by) REFERENCES admin_users (id),
    CONSTRAINT fk_sounds_updated_by FOREIGN KEY (updated_by) REFERENCES admin_users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
