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

    private String nowUtc() {
        return java.time.LocalDateTime.now(java.time.ZoneOffset.UTC)
                .format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
    }

    private String tsToString(java.sql.Timestamp ts) {
        return ts != null ? ts.toLocalDateTime()
                .format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")) : null;
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
        msg.setCreatedAt(tsToString(rs.getTimestamp("created_at")));
        msg.setDeliveredAt(tsToString(rs.getTimestamp("delivered_at")));
        msg.setReceivedAt(tsToString(rs.getTimestamp("received_at")));
        msg.setReadAt(tsToString(rs.getTimestamp("read_at")));
        return msg;
    };

    // ── Schema + Stored Procedures ──
    public void createTableIfNotExists() {
        String sql = "CREATE TABLE IF NOT EXISTS messages (" +
                     "id BIGINT AUTO_INCREMENT PRIMARY KEY, " +
                     "room VARCHAR(255) NOT NULL, " +
                     "sender VARCHAR(255) NOT NULL, " +
                     "content TEXT NOT NULL, " +
                     "status INT DEFAULT 0, " +
                     "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, " +
                     "delivered_at TIMESTAMP NULL, " +
                     "received_at TIMESTAMP NULL, " +
                     "read_at TIMESTAMP NULL" +
                     ")";
        jdbcTemplate.execute(sql);

        // Migrate existing tables: add new columns if absent
        for (String col : new String[]{"delivered_at", "received_at", "read_at"}) {
            try {
                jdbcTemplate.execute("ALTER TABLE messages ADD COLUMN " + col + " TIMESTAMP NULL");
            } catch (Exception ignored) { /* Column already exists */ }
        }

        // sp_save_message → returns full row via LAST_INSERT_ID()
        jdbcTemplate.execute("DROP PROCEDURE IF EXISTS sp_save_message");
        jdbcTemplate.execute("CREATE PROCEDURE sp_save_message(" +
                             "IN p_room VARCHAR(255), " +
                             "IN p_sender VARCHAR(255), " +
                             "IN p_content TEXT) " +
                             "BEGIN " +
                             "INSERT INTO messages (room, sender, content, status) VALUES (p_room, p_sender, p_content, 0); " +
                             "SELECT LAST_INSERT_ID(); " +
                             "END");

        // sp_update_message_status → only advances status (never regresses) + sets lifecycle timestamps
        jdbcTemplate.execute("DROP PROCEDURE IF EXISTS sp_update_message_status");
        jdbcTemplate.execute("CREATE PROCEDURE sp_update_message_status(" +
                             "IN p_id BIGINT, IN p_status INT, IN p_ts TIMESTAMP) " +
                             "BEGIN " +
                             "  IF p_status = 1 THEN " +
                             "    UPDATE messages SET status = p_status, delivered_at = p_ts " +
                             "      WHERE id = p_id AND status < p_status; " +
                             "  ELSEIF p_status = 2 THEN " +
                             "    UPDATE messages SET status = p_status, received_at = p_ts " +
                             "      WHERE id = p_id AND status < p_status; " +
                             "  ELSEIF p_status = 3 THEN " +
                             "    UPDATE messages SET status = p_status, read_at = p_ts " +
                             "      WHERE id = p_id AND status < p_status; " +
                             "  ELSE " +
                             "    UPDATE messages SET status = p_status " +
                             "      WHERE id = p_id AND status < p_status; " +
                             "  END IF; " +
                             "END");

        jdbcTemplate.execute("DROP PROCEDURE IF EXISTS sp_get_messages_by_room");
        jdbcTemplate.execute("CREATE PROCEDURE sp_get_messages_by_room(IN p_room VARCHAR(255)) " +
                             "BEGIN " +
                             "SELECT * FROM messages WHERE room = p_room ORDER BY created_at ASC; " +
                             "END");

        jdbcTemplate.execute("DROP PROCEDURE IF EXISTS sp_get_dm_messages");
        jdbcTemplate.execute("CREATE PROCEDURE sp_get_dm_messages(IN p_room VARCHAR(255)) " +
                             "BEGIN " +
                             "SELECT * FROM messages WHERE room = p_room ORDER BY created_at ASC; " +
                             "END");
    }

    public Long save(Message msg) {
        try {
            String encryptedContent = EncryptionUtils.encrypt(msg.getContent());
            Long id = jdbcTemplate.queryForObject("CALL sp_save_message(?, ?, ?)",
                    Long.class, msg.getRoom(), msg.getSender(), encryptedContent);
            System.out.println("[DB] Saved message to room '" + msg.getRoom() + "' with ID: " + id);
            return id;
        } catch (Exception e) {
            System.err.println("[DB ERROR] Failed to save message: " + e.getMessage());
            return null;
        }
    }

    /**
     * @param status 1=delivered, 2=received_by_device, 3=read
     */
    public void updateStatus(Long id, Integer status) {
        String ts = nowUtc();
        jdbcTemplate.update("CALL sp_update_message_status(?, ?, ?)", id, status, ts);
    }

    public List<Message> findByRoom(String room) {
        return jdbcTemplate.query("CALL sp_get_messages_by_room(?)", messageRowMapper, room);
    }
}
