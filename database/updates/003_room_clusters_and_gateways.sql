CREATE TABLE room_clusters (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(160) NOT NULL,
    slug VARCHAR(190) NOT NULL,
    description TEXT NULL,
    entry_room_id INT UNSIGNED NOT NULL,
    gateway_return_mode ENUM('behind', 'door') NOT NULL DEFAULT 'behind',
    gateway_return_region_id VARCHAR(190) NULL,
    is_start TINYINT(1) NOT NULL DEFAULT 0,
    created_by INT UNSIGNED NOT NULL,
    updated_by INT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_room_clusters_slug (slug),
    KEY idx_room_clusters_entry_room (entry_room_id),
    KEY idx_room_clusters_start (is_start),
    CONSTRAINT fk_room_clusters_entry_room FOREIGN KEY (entry_room_id) REFERENCES rooms (id),
    CONSTRAINT fk_room_clusters_created_by FOREIGN KEY (created_by) REFERENCES admin_users (id),
    CONSTRAINT fk_room_clusters_updated_by FOREIGN KEY (updated_by) REFERENCES admin_users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE room_cluster_nodes (
    cluster_id INT UNSIGNED NOT NULL,
    room_id INT UNSIGNED NOT NULL,
    position_x INT NOT NULL DEFAULT 80,
    position_y INT NOT NULL DEFAULT 80,
    PRIMARY KEY (cluster_id, room_id),
    UNIQUE KEY uq_room_cluster_nodes_room (room_id),
    CONSTRAINT fk_room_cluster_nodes_cluster FOREIGN KEY (cluster_id) REFERENCES room_clusters (id) ON DELETE CASCADE,
    CONSTRAINT fk_room_cluster_nodes_room FOREIGN KEY (room_id) REFERENCES rooms (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE room_connections (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    source_room_id INT UNSIGNED NOT NULL,
    source_region_id VARCHAR(190) NOT NULL,
    target_room_id INT UNSIGNED NOT NULL,
    return_mode ENUM('behind', 'door', 'one_way') NOT NULL DEFAULT 'behind',
    target_region_id VARCHAR(190) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_room_connections_source (source_room_id, source_region_id),
    KEY idx_room_connections_target (target_room_id),
    CONSTRAINT fk_room_connections_source FOREIGN KEY (source_room_id) REFERENCES rooms (id) ON DELETE CASCADE,
    CONSTRAINT fk_room_connections_target FOREIGN KEY (target_room_id) REFERENCES rooms (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE room_gateways (
    room_id INT UNSIGNED NOT NULL,
    destination_count SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    PRIMARY KEY (room_id),
    CONSTRAINT fk_room_gateways_room FOREIGN KEY (room_id) REFERENCES rooms (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE room_gateway_exits (
    gateway_room_id INT UNSIGNED NOT NULL,
    region_id VARCHAR(190) NOT NULL,
    PRIMARY KEY (gateway_room_id, region_id),
    CONSTRAINT fk_room_gateway_exits_gateway FOREIGN KEY (gateway_room_id) REFERENCES room_gateways (room_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE room_gateway_candidates (
    gateway_room_id INT UNSIGNED NOT NULL,
    cluster_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (gateway_room_id, cluster_id),
    KEY idx_room_gateway_candidates_cluster (cluster_id),
    CONSTRAINT fk_room_gateway_candidates_gateway FOREIGN KEY (gateway_room_id) REFERENCES room_gateways (room_id) ON DELETE CASCADE,
    CONSTRAINT fk_room_gateway_candidates_cluster FOREIGN KEY (cluster_id) REFERENCES room_clusters (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
