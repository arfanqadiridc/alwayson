package com.alwayson.api.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public class RoomRepository {

    private final JdbcTemplate jdbcTemplate;

    public RoomRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void createTableIfNotExists() {
        String sql = "CREATE TABLE IF NOT EXISTS rooms (" +
                     "id BIGINT AUTO_INCREMENT PRIMARY KEY, " +
                     "name VARCHAR(255) UNIQUE NOT NULL, " +
                     "created_by VARCHAR(255) NOT NULL, " +
                     "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP" +
                     ")";
        jdbcTemplate.execute(sql);
    }

    public void save(String name, String createdBy) {
        String sql = "INSERT IGNORE INTO rooms (name, created_by) VALUES (?, ?)";
        jdbcTemplate.update(sql, name, createdBy);
    }

    public List<String> findAllNames() {
        return jdbcTemplate.queryForList("SELECT name FROM rooms ORDER BY name ASC", String.class);
    }
}
