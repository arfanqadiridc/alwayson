package com.alwayson.util;

import com.alwayson.api.util.CryptoUtils;

public class DbPasswordReader {
    public static void main(String[] args) {
        String encrypted = "ENC(p8YIi4BOwzEynUgYSJpJYg==)";
        String plain = CryptoUtils.decrypt(encrypted);
        System.out.println("Database password = " + plain);
    }
}
