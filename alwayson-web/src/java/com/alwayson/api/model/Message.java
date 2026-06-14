package com.alwayson.api.model;

public class Message {
    private Long id;
    private String room;
    private String sender;
    private String content;
    private Integer status;
    private String createdAt; // String to avoid Jackson LocalDateTime serialization issues with netty-socketio

    public Message() {}

    public Message(String room, String sender, String content) {
        this.room = room;
        this.sender = sender;
        this.content = content;
        this.status = 0;
        this.createdAt = java.time.LocalDateTime.now()
                .format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
    }

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
}
