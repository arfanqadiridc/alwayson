package com.alwayson.api.repository;

import com.alwayson.api.model.User;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * Uses raw JDBC via Spring's JdbcTemplate.
 * This completely prevents SQL Injection by utilizing PreparedStatement variable bindings (the ? placeholders).
 * It bypasses heavy ORMs for raw processing speed and manual SQL control.
 */
@Repository
public class UserRepository {

    private final JdbcTemplate jdbcTemplate;

    public UserRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }
    @org.springframework.lang.NonNull
    private final RowMapper<User> userRowMapper = (rs, rowNum) -> {
        User user = new User();
        user.setId(rs.getLong("id"));
        user.setUsername(rs.getString("username"));
        user.setPassword(rs.getString("password"));
        user.setRole(rs.getString("role"));
        user.setPublicKey(rs.getString("public_key"));
        user.setEncryptedPrivateKey(rs.getString("encrypted_private_key"));
        return user;
    };

    public Optional<User> findByUsername(String username) {
        String sql = "CALL sp_get_user_by_username(?)";
        List<User> results = jdbcTemplate.query(sql, userRowMapper, username);
        return results.stream().findFirst();
    }

    public void save(User user) {
        String sql = "CALL sp_create_user(?, ?, ?)";
        jdbcTemplate.update(sql, user.getUsername(), user.getPassword(), user.getRole());
    }

    public void updateKeys(String username, String publicKey, String encryptedPrivateKey) {
        String sql = "CALL sp_update_user_keys(?, ?, ?)";
        jdbcTemplate.update(sql, username, publicKey, encryptedPrivateKey);
    }
    
    /**
     * Helper to create table if not exists - Useful for initializing our raw JDBC database.
     */
    public void createTableIfNotExists() {
        // 1. Create table with all columns if it doesn't exist at all
        String sql = "CREATE TABLE IF NOT EXISTS users (" +
                     "id BIGINT AUTO_INCREMENT PRIMARY KEY, " +
                     "username VARCHAR(255) UNIQUE NOT NULL, " +
                     "password VARCHAR(255) NOT NULL, " +
                     "role VARCHAR(50) NOT NULL, " +
                     "public_key TEXT, " +
                     "encrypted_private_key TEXT" +
                     ")";
        jdbcTemplate.execute(sql);

        // 2. For existing tables, safely try to add the new columns (MySQL 5.x/8.x compatible)
        try {
            jdbcTemplate.execute("ALTER TABLE users ADD COLUMN public_key TEXT");
        } catch (Exception e) {
            // Column likely already exists, ignore
        }
        try {
            jdbcTemplate.execute("ALTER TABLE users ADD COLUMN encrypted_private_key TEXT");
        } catch (Exception e) {
            // Column likely already exists, ignore
        }

        jdbcTemplate.execute("DROP PROCEDURE IF EXISTS sp_get_user_by_username");
        jdbcTemplate.execute("CREATE PROCEDURE sp_get_user_by_username(IN p_username VARCHAR(255)) " +
                             "BEGIN " +
                             "SELECT * FROM users WHERE username = p_username; " +
                             "END");

        jdbcTemplate.execute("DROP PROCEDURE IF EXISTS sp_create_user");
        jdbcTemplate.execute("CREATE PROCEDURE sp_create_user(" +
                             "IN p_username VARCHAR(255), " +
                             "IN p_password VARCHAR(255), " +
                             "IN p_role VARCHAR(50)) " +
                             "BEGIN " +
                             "INSERT INTO users (username, password, role) VALUES (p_username, p_password, p_role); " +
                             "END");

        jdbcTemplate.execute("DROP PROCEDURE IF EXISTS sp_update_user_keys");
        jdbcTemplate.execute("CREATE PROCEDURE sp_update_user_keys(" +
                             "IN p_username VARCHAR(255), " +
                             "IN p_public_key TEXT, " +
                             "IN p_encrypted_private_key TEXT) " +
                             "BEGIN " +
                             "UPDATE users SET public_key = p_public_key, encrypted_private_key = p_encrypted_private_key WHERE username = p_username; " +
                             "END");

        jdbcTemplate.execute("DROP PROCEDURE IF EXISTS sp_get_all_usernames");
        jdbcTemplate.execute("CREATE PROCEDURE sp_get_all_usernames() " +
                             "BEGIN " +
                             "SELECT username FROM users ORDER BY username ASC; " +
                             "END");
    }

    public List<String> findAllUsernames() {
        return jdbcTemplate.queryForList("CALL sp_get_all_usernames()", String.class);
    }
}
