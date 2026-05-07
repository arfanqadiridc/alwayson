package com.alwayson.api;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;

@SpringBootApplication(exclude = {DataSourceAutoConfiguration.class})
public class AlwaysonApiApplication {

    public static void main(String[] args) {
        System.out.println("Starting AlwaysOn API in highly secure mode...");
        SpringApplication.run(AlwaysonApiApplication.class, args);
    }
}
