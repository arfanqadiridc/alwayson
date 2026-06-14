package com.alwayson.api.component;
 
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
 
import java.util.HashMap;
import java.util.Map;
 
/**
 * Catches all exceptions across the entire API and returns clean JSON instead of 
 * allowing Tomcat to dump raw stack traces to the console.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {
 
    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<?> handleAuthenticationException(AuthenticationException ex) {
        System.err.println("[AUTH ERROR] Login failed: " + ex.getMessage());
        return buildResponse(HttpStatus.UNAUTHORIZED, "Authentication Failed", ex.getMessage());
    }
 
    @ExceptionHandler(Exception.class)
    public ResponseEntity<?> handleGlobalException(Exception ex) {
        // Log the root cause briefly without the 100-line stack trace
        System.err.println("[SYSTEM ERROR] " + ex.getClass().getSimpleName() + ": " + ex.getMessage());
        // For debugging purposes, you can still print the stack trace if needed:
        // ex.printStackTrace(); 
        
        return buildResponse(HttpStatus.INTERNAL_SERVER_ERROR, "Internal Server Error", ex.getMessage());
    }
 
    private ResponseEntity<Map<String, String>> buildResponse(HttpStatus status, String error, String message) {
        Map<String, String> body = new HashMap<>();
        body.put("error", error);
        body.put("message", message);
        // Using the integer value ensures no @NonNull HttpStatusCode conversion warnings
        return ResponseEntity.status(status.value()).body(body);
    }
}
