package com.alwayson.api.config;

import com.alwayson.api.util.CryptoUtils;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import javax.sql.DataSource;

@Configuration
public class DatabaseConfig {

    @Value("${spring.datasource.url}")
    private String url;

    @Value("${spring.datasource.username}")
    private String username;

    @Value("${spring.datasource.password}")
    private String encryptedPassword;

    @Bean
    @org.springframework.context.annotation.Primary
    public DataSource dataSource() {
        System.out.println("Intercepting Database Boot! Decrypting secure YAML credentials...");
        
        // Physically decrypt the AES encoded connection password
        String plainPassword = CryptoUtils.decrypt(encryptedPassword);

        HikariConfig config = new HikariConfig();
        config.setJdbcUrl(url);
        config.setUsername(username);
        config.setPassword(plainPassword);
        // Basic optimal pool settings mapped manually instead of auto-config
        config.setMaximumPoolSize(20);
        config.setMinimumIdle(5);

        return new HikariDataSource(config);
    }
}
