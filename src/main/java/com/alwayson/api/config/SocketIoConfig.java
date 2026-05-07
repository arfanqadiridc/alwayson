package com.alwayson.api.config;

import com.corundumstudio.socketio.Configuration;
import com.corundumstudio.socketio.SocketIOServer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;

@org.springframework.context.annotation.Configuration
public class SocketIoConfig {

    @Value("${socketio.server.host}")
    private String host;

    @Value("${socketio.server.port}")
    private Integer port;

    @Bean
    public SocketIOServer socketIOServer() {
        Configuration config = new Configuration();
        config.setHostname(host);
        config.setPort(port);

        // Allow all origins — CORS for Socket.IO is handled separately from Spring MVC.
        // The Angular dev server origin check is done at the HTTP layer, not the WebSocket layer.
        config.setOrigin("*");

        // Increase ping timeouts to prevent spurious disconnects on slow dev machines
        config.setPingTimeout(60000);
        config.setPingInterval(25000);

        // Allow custom requests (needed for polling transport handshake)
        config.setAllowCustomRequests(true);

        // Add explicit Exception Listener to catch and log Netty/Socket.IO level faults
        config.setExceptionListener(new com.corundumstudio.socketio.listener.DefaultExceptionListener() {
            @Override
            public void onConnectException(Exception e, com.corundumstudio.socketio.SocketIOClient client) {
                System.err.println("[Socket.IO] Connect Error: " + e.getMessage());
            }

            @Override
            public void onEventException(Exception e, java.util.List<Object> args, com.corundumstudio.socketio.SocketIOClient client) {
                System.err.println("[Socket.IO] Event Error: " + e.getMessage());
                e.printStackTrace();
            }
        });

        return new SocketIOServer(config);
    }
}
