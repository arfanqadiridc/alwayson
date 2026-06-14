package com.alwayson.api.socket;

import com.corundumstudio.socketio.SocketIOServer;
import com.alwayson.api.model.Message;
import com.alwayson.api.repository.MessageRepository;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;

/**
 * Handles real-time websocket connections perfectly bypassing HTTP bottlenecks.
 * Demonstrates Netty Socket.IO Rooms capability natively.
 */
@Component
public class SocketEventHandler {

    private final SocketIOServer server;
    private final MessageRepository messageRepository;

    public SocketEventHandler(SocketIOServer server, MessageRepository messageRepository) {
        this.server = server;
        this.messageRepository = messageRepository;
    }

    public static class RoomMessage {
        public String room;
        public String sender;
        public String message;
    }

    public static class RegisterEvent {
        public String username;
    }

    public static class MessageStatusUpdate {
        public Long id;
        public String room;
        public Integer status;
    }

    public static class TypingEvent {
        public String room;
        public String sender;
        public boolean typing;
    }

    public static class WebRTCSignal {
        public String room;
        public String sender;
        public Object signal; // Can be SDP or ICE candidate
    }

    @PostConstruct
    public void startSocketIOServer() {
        server.addConnectListener(client -> {
            System.out.println("Client Connected: " + client.getSessionId());
        });

        server.addDisconnectListener(client -> {
            System.out.println("Client Disconnected: " + client.getSessionId());
        });

        // WebRTC Signaling
        server.addEventListener("webrtc_offer", WebRTCSignal.class, (client, data, ackSender) -> {
            server.getRoomOperations(data.room).sendEvent("webrtc_offer", data);
        });

        server.addEventListener("webrtc_answer", WebRTCSignal.class, (client, data, ackSender) -> {
            server.getRoomOperations(data.room).sendEvent("webrtc_answer", data);
        });

        server.addEventListener("webrtc_ice_candidate", WebRTCSignal.class, (client, data, ackSender) -> {
            server.getRoomOperations(data.room).sendEvent("webrtc_ice_candidate", data);
        });

        // 0. Register username → join personal notification room
        server.addEventListener("register", RegisterEvent.class, (client, data, ackSender) -> {
            client.set("username", data.username);
            String personalRoom = "pnr_" + data.username;
            client.joinRoom(personalRoom);
            System.out.println("User '" + data.username + "' registered and joined: " + personalRoom);
        });

        // 1. Join a Room (groups)
        server.addEventListener("join_room", String.class, (client, roomName, ackSender) -> {
            client.joinRoom(roomName);
            System.out.println("Client " + client.getSessionId() + " joined room: " + roomName);
            Message systemMsg = new Message(roomName, "System", "A user joined the room!");
            server.getRoomOperations(roomName).sendEvent("chat_message", systemMsg);
        });

        // 2. Leave a Room (called on logout only)
        server.addEventListener("leave_room", String.class, (client, roomName, ackSender) -> {
            client.leaveRoom(roomName);
        });

        // 3. Broadcast to Room with ACKS + personal notification rooms
        server.addEventListener("room_message", RoomMessage.class, (client, data, ackSender) -> {
            String sender = data.sender != null ? data.sender : client.get("username");
            if (sender == null) sender = "Unknown";
            
            System.out.println("Message from " + sender + " for room '" + data.room + "': " + data.message);

            Message newMsg = new Message(data.room, sender, data.message);
            Long id = messageRepository.save(newMsg);
            newMsg.setId(id);

            // ACK back to sender with database ID (sets Single Tick ✓)
            if (ackSender.isAckRequested()) {
                ackSender.sendAckData(newMsg);
            }

            if (data.room.startsWith("dm_")) {
                // DM: broadcast only to both participants' personal notification rooms.
                // This way recipient gets the message even if they haven't opened the DM thread.
                // Room format: dm_{userA}_{userB} (always alphabetically sorted)
                String key = data.room.substring(3); // strip "dm_"
                int sep = key.indexOf('_');
                if (sep > 0) {
                    String userA = key.substring(0, sep);
                    String userB = key.substring(sep + 1);
                    server.getRoomOperations("pnr_" + userA).sendEvent("chat_message", newMsg);
                    server.getRoomOperations("pnr_" + userB).sendEvent("chat_message", newMsg);
                }
            } else {
                // Group room: broadcast to all sockets in that room
                server.getRoomOperations(data.room).sendEvent("chat_message", newMsg);
            }
        });

        // 4. Update Status Lifecycle
        server.addEventListener("message_status", MessageStatusUpdate.class, (client, data, ackSender) -> {
            messageRepository.updateStatus(data.id, data.status);
            // Broadcast status update to the right audience
            if (data.room != null && data.room.startsWith("dm_")) {
                String key = data.room.substring(3);
                int sep = key.indexOf('_');
                if (sep > 0) {
                    server.getRoomOperations("pnr_" + key.substring(0, sep)).sendEvent("status_update", data);
                    server.getRoomOperations("pnr_" + key.substring(sep + 1)).sendEvent("status_update", data);
                }
            } else {
                server.getRoomOperations(data.room).sendEvent("status_update", data);
            }
        });

        // 5. Typing Indicators
        server.addEventListener("typing", TypingEvent.class, (client, data, ackSender) -> {
            if (data.room != null && data.room.startsWith("dm_")) {
                String key = data.room.substring(3);
                int sep = key.indexOf('_');
                if (sep > 0) {
                    server.getRoomOperations("pnr_" + key.substring(0, sep)).sendEvent("user_typing", data);
                    server.getRoomOperations("pnr_" + key.substring(sep + 1)).sendEvent("user_typing", data);
                }
            } else {
                server.getRoomOperations(data.room).sendEvent("user_typing", data);
            }
        });

        server.start();
        System.out.println("Socket.IO Server with Rooms started on Port " + server.getConfiguration().getPort());
    }

    @PreDestroy
    public void stopSocketIOServer() {
        this.server.stop();
        System.out.println("Socket.IO Server stopped gracefully.");
    }
}
