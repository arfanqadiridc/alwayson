package com.alwayson.api.controller;

import com.alwayson.api.repository.UserRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserRepository userRepository;

    public UserController(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    // Returns list of all registered usernames — used to populate DM sidebar
    @GetMapping
    public ResponseEntity<List<String>> getAllUsers() {
        List<String> users = userRepository.findAllUsernames();
        return ResponseEntity.ok(users);
    }
}
