package com.alwayson.api.component;

import com.alwayson.api.model.User;
import com.alwayson.api.repository.MessageRepository;
import com.alwayson.api.repository.RoomRepository;
import com.alwayson.api.repository.UserRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class DatabaseInitializer implements CommandLineRunner {

    private final UserRepository userRepository;
    private final MessageRepository messageRepository;
    private final RoomRepository roomRepository;
    private final PasswordEncoder passwordEncoder;

    public DatabaseInitializer(UserRepository userRepository, MessageRepository messageRepository, RoomRepository roomRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.messageRepository = messageRepository;
        this.roomRepository = roomRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public void run(String... args) throws Exception {
        System.out.println("Initializing raw JDBC Database layout...");
        userRepository.createTableIfNotExists();
        messageRepository.createTableIfNotExists();
        roomRepository.createTableIfNotExists();

        // ── Seed Predefined Groups ──
        roomRepository.save("general", "system");
        roomRepository.save("engineering", "system");
        roomRepository.save("support", "system");
        roomRepository.save("random", "system");

        // 2. Seed all employees from organization directory
        try {
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            org.springframework.core.io.ClassPathResource resource = new org.springframework.core.io.ClassPathResource("employees.json");
            java.util.List<java.util.Map<String, Object>> employees = mapper.readValue(
                resource.getInputStream(),
                new com.fasterxml.jackson.core.type.TypeReference<java.util.List<java.util.Map<String, Object>>>() {}
            );

            String defaultPass = passwordEncoder.encode("AlwaysOn@2026");
            for (java.util.Map<String, Object> emp : employees) {
                String username = (String) emp.get("username");
                String role = "ROLE_" + emp.get("role");
                if (userRepository.findByUsername(username).isEmpty()) {
                    User user = new User(null, username, defaultPass, role);
                    userRepository.save(user);
                    System.out.println("Seeded employee: " + username);
                }
            }
        } catch (Exception e) {
            System.err.println("Failed to seed employees: " + e.getMessage());
        }
    }
}
