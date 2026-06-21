package com.alwayson.api.model;

public class Message {
    private Long id;
    private String room;
    private String sender;
    private String content;
    private Integer status;
    // Lifecycle timestamps (String to avoid Jackson/netty-socketio serialization issues)
    private String createdAt;    // When server persisted the message  (single ✓)
    private String deliveredAt;  // When server fanned-out to recipient room (double ✓✓ grey)
    private String receivedAt;   // When recipient's device received it  (double ✓✓ grey – device ACK)
    private String readAt;       // When recipient opened & read it      (blue ✓✓)

    public Message() {}

    public Message(String room, String sender, String content) {
        this.room = room;
        this.sender = sender;
        this.content = content;
        this.status = 0;
        this.createdAt = java.time.LocalDateTime.now(java.time.ZoneOffset.UTC)
                .format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
    }

    // ── Getters / Setters ──
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getRoom() { return room; }
    public void setRoom(String room) { this.room = room; }

    public String getSender() { return sender; }
    public void setSender(String sender) { this.sender = sender; }

    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }

    public Integer getStatus() { return status; }
    public void setStatus(Integer status) { this.status = status; }

    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }

    public String getDeliveredAt() { return deliveredAt; }
    public void setDeliveredAt(String deliveredAt) { this.deliveredAt = deliveredAt; }

    public String getReceivedAt() { return receivedAt; }
    public void setReceivedAt(String receivedAt) { this.receivedAt = receivedAt; }

    public String getReadAt() { return readAt; }
    public void setReadAt(String readAt) { this.readAt = readAt; }
}
