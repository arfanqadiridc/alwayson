package com.alwayson.api.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/employees")
public class EmployeeController {

    private final ObjectMapper objectMapper;

    public EmployeeController(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> getEmployees() throws IOException {
        ClassPathResource resource = new ClassPathResource("employees.json");
        List<Map<String, Object>> employees = objectMapper.readValue(
                resource.getInputStream(),
                new TypeReference<List<Map<String, Object>>>() {
                });
        return ResponseEntity.ok(employees);
    }

    @GetMapping("/departments")
    public ResponseEntity<List<String>> getDepartments() throws IOException {
        ClassPathResource resource = new ClassPathResource("employees.json");
        List<Map<String, Object>> employees = objectMapper.readValue(
                resource.getInputStream(),
                new TypeReference<List<Map<String, Object>>>() {
                });
        List<String> departments = employees.stream()
                .map(e -> (String) e.get("department"))
                .distinct()
                .toList();
        return ResponseEntity.ok(departments);
    }
}
