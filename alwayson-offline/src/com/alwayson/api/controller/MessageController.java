package com.alwayson.api.controller;

import com.alwayson.api.model.Message;
import com.alwayson.api.repository.MessageRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/messages")
public class MessageController {
    
    private final MessageRepository messageRepository;
    
    public MessageController(MessageRepository messageRepository) {
        this.messageRepository = messageRepository;
    }
    
    // Group Room messages — room name is e.g. "general", "engineering"
    @GetMapping("/room/{room}")
    public ResponseEntity<List<Message>> getRoomMessages(@PathVariable("room") String room) {
        List<Message> messages = messageRepository.findByRoom(room);
        return ResponseEntity.ok(messages);
    }

    // Direct messages — room name is the canonical DM key e.g "dm_alice_bob"
    @GetMapping("/dm/{userA}/{userB}")
    public ResponseEntity<List<Message>> getDmMessages(@PathVariable("userA") String userA, @PathVariable("userB") String userB) {
        // Guarantee deterministic key regardless of who calls the endpoint
        String roomKey = buildDmRoomKey(userA, userB);
        List<Message> messages = messageRepository.findByRoom(roomKey);
        return ResponseEntity.ok(messages);
    }

    // Helper — always produce sorted canonical key so "dm_alice_bob" == "dm_bob_alice"
    public static String buildDmRoomKey(String a, String b) {
        String[] sorted = new String[]{a, b};
        java.util.Arrays.sort(sorted);
        return "dm_" + sorted[0] + "_" + sorted[1];
    }
}
