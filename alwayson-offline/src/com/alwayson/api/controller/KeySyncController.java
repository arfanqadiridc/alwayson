package com.alwayson.api.controller;

import com.alwayson.api.repository.UserRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/keys")
public class KeySyncController {

    private final UserRepository userRepository;

    public KeySyncController(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public static class KeyUploadRequest {
        public String publicKey;
        public String encryptedPrivateKey;
    }

    @PostMapping("/upload")
    public ResponseEntity<?> uploadKeys(@RequestBody KeyUploadRequest request, Authentication authentication) {
        String username = authentication.getName();
        userRepository.updateKeys(username, request.publicKey, request.encryptedPrivateKey);
        return ResponseEntity.ok(Map.of("message", "Keys synchronized successfully"));
    }

    @GetMapping("/download")
    public ResponseEntity<?> downloadKeys(Authentication authentication) {
        String username = authentication.getName();
        return userRepository.findByUsername(username)
                .map(user -> {
                    Map<String, String> keys = new HashMap<>();
                    keys.put("publicKey", user.getPublicKey());
                    keys.put("encryptedPrivateKey", user.getEncryptedPrivateKey());
                    return ResponseEntity.ok(keys);
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/public/{username}")
    public ResponseEntity<?> getPublicKey(@PathVariable String username) {
        return userRepository.findByUsername(username)
                .map(user -> ResponseEntity.ok(Map.of("publicKey", user.getPublicKey())))
                .orElse(ResponseEntity.notFound().build());
    }
}
