package com.alwayson.api.repository;

import com.alwayson.api.model.Message;
import com.alwayson.api.util.EncryptionUtils;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public class MessageRepository {
    private final JdbcTemplate jdbcTemplate;

    public MessageRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @org.springframework.lang.NonNull
    private final RowMapper<Message> messageRowMapper = (rs, rowNum) -> {
        Message msg = new Message();
        msg.setId(rs.getLong("id"));
        msg.setRoom(rs.getString("room"));
        msg.setSender(rs.getString("sender"));
        // Decrypt content for data-at-rest requirement
        String content = rs.getString("content");
        msg.setContent(EncryptionUtils.decrypt(content));
        msg.setStatus(rs.getInt("status"));
        java.sql.Timestamp ts = rs.getTimestamp("created_at");
        msg.setCreatedAt(ts != null ? ts.toLocalDateTime()
                .format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")) : "");
        return msg;
    };

    public void createTableIfNotExists() {
        String sql = "CREATE TABLE IF NOT EXISTS messages (" +
                     "id BIGINT AUTO_INCREMENT PRIMARY KEY, " +
                     "room VARCHAR(255) NOT NULL, " +
                     "sender VARCHAR(255) NOT NULL, " +
                     "content TEXT NOT NULL, " +
                     "status INT DEFAULT 0, " +
                     "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP" +
                     ")";
        jdbcTemplate.execute(sql);
        
        jdbcTemplate.execute("DROP PROCEDURE IF EXISTS sp_save_message");
        jdbcTemplate.execute("CREATE PROCEDURE sp_save_message(" +
                             "IN p_room VARCHAR(255), " +
                             "IN p_sender VARCHAR(255), " +
                             "IN p_content TEXT) " +
                             "BEGIN " +
                             "INSERT INTO messages (room, sender, content, status) VALUES (p_room, p_sender, p_content, 0); " +
                             "SELECT LAST_INSERT_ID(); " +
                             "END");

        jdbcTemplate.execute("DROP PROCEDURE IF EXISTS sp_update_message_status");
        jdbcTemplate.execute("CREATE PROCEDURE sp_update_message_status(" +
                             "IN p_id BIGINT, IN p_status INT) " +
                             "BEGIN " +
                             "UPDATE messages SET status = p_status WHERE id = p_id AND status < p_status; " +
                             "END");

        jdbcTemplate.execute("DROP PROCEDURE IF EXISTS sp_get_messages_by_room");
        jdbcTemplate.execute("CREATE PROCEDURE sp_get_messages_by_room(IN p_room VARCHAR(255)) " +
                             "BEGIN " +
                             "SELECT * FROM messages WHERE room = p_room ORDER BY created_at ASC; " +
                             "END");
    }

    public Long save(Message msg) {
        try {
            // Encrypt content for data-at-rest requirement
            String encryptedContent = EncryptionUtils.encrypt(msg.getContent());
            Long id = jdbcTemplate.queryForObject("CALL sp_save_message(?, ?, ?)", Long.class, msg.getRoom(), msg.getSender(), encryptedContent);
            System.out.println("[DB] Saved message to room '" + msg.getRoom() + "' with ID: " + id);
            return id;
        } catch (Exception e) {
            System.err.println("[DB ERROR] Failed to save message: " + e.getMessage());
            return null;
        }
    }

    public void updateStatus(Long id, Integer status) {
        jdbcTemplate.update("CALL sp_update_message_status(?, ?)", id, status);
    }

    public List<Message> findByRoom(String room) {
        return jdbcTemplate.query("CALL sp_get_messages_by_room(?)", messageRowMapper, room);
    }
}
