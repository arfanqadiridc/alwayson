package com.alwayson.api.config;

import com.alwayson.api.security.JwtAuthenticationFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.annotation.web.configurers.HeadersConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

/**
 * Hacking-Proof Security Configuration in Spring Boot 3.
 */
@Configuration
@EnableWebSecurity
@org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthFilter;

    public SecurityConfig(JwtAuthenticationFilter jwtAuthFilter) {
        this.jwtAuthFilter = jwtAuthFilter;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            // 1. Disable CSRF since we use stateless JWT (JWT is not susceptible to CSRF if stored correctly)
            .csrf(AbstractHttpConfigurer::disable)
            // 2. Set Session state to STATELESS (no JSESSIONID, completely API driven)
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            // 3. Setup basic headers to prevent XSS, ClickJacking, and MIME Sniffing
            .headers(headers -> headers
                .frameOptions(HeadersConfigurer.FrameOptionsConfig::deny)
                .xssProtection(HeadersConfigurer.XXssConfig::disable) // Modern browsers use CSP
            )
            // 4. Secure Endpoints
            .authorizeHttpRequests(authz -> authz
                // Open points
                .requestMatchers("/api/auth/**").permitAll()
                .requestMatchers("/api/public/**").permitAll()
                .requestMatchers("/index.html", "/socket.io.js", "/error").permitAll()
                
                // Tiered Access
                .requestMatchers("/api/employees/**").hasAnyRole("ADMIN", "MANAGER")
                .requestMatchers("/api/keys/**").authenticated()
                
                // Everything else requires authenticated JWT
                .anyRequest().authenticated()
            )
            // 5. Add custom JWT filter
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class)
            // 6. Handle authentication exceptions gracefully to avoid messy Tomcat stack traces
            .exceptionHandling(ex -> ex.authenticationEntryPoint((request, response, authException) -> {
                System.err.println("Unauthorized access attempt: " + request.getRequestURI() + " - " + authException.getMessage());
                response.setStatus(401);
                response.setContentType("application/json");
                response.getWriter().write("{\"error\": \"Unauthorized\", \"message\": \"" + authException.getMessage() + "\"}");
            }));

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(); // Strong BCrypt hashing out of the box
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration authConfig) throws Exception {
        return authConfig.getAuthenticationManager();
    }
}
