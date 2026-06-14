package com.alwayson.api.controller;

import com.alwayson.api.repository.RoomRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/rooms")
public class RoomController {

    private final RoomRepository roomRepository;

    public RoomController(RoomRepository roomRepository) {
        this.roomRepository = roomRepository;
    }

    @GetMapping
    public ResponseEntity<List<String>> getRooms() {
        return ResponseEntity.ok(roomRepository.findAllNames());
    }

    @PostMapping
    public ResponseEntity<Void> createRoom(@RequestBody Map<String, String> body, Authentication auth) {
        String name = body.get("name");
        if (name != null && !name.isEmpty()) {
            roomRepository.save(name, auth.getName());
            return ResponseEntity.ok().build();
        }
        return ResponseEntity.badRequest().build();
    }
}
