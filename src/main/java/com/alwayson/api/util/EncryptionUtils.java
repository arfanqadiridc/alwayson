package com.alwayson.api.util;

import javax.crypto.Cipher;
import javax.crypto.spec.SecretKeySpec;
import java.util.Base64;

/**
 * Utility for Data-at-Rest encryption.
 */
public class EncryptionUtils {

    private static final String ALGORITHM = "AES";
    // In production, this should be loaded from a secure environment variable or vault.
    private static final String MASTER_KEY = "AlwaysOnSecureMK!2026"; // Must be 16, 24, or 32 chars

    public static String encrypt(String value) {
        try {
            SecretKeySpec secretKey = new SecretKeySpec(MASTER_KEY.substring(0, 16).getBytes(), ALGORITHM);
            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.ENCRYPT_MODE, secretKey);
            byte[] encrypted = cipher.doFinal(value.getBytes());
            return Base64.getEncoder().encodeToString(encrypted);
        } catch (Exception e) {
            throw new RuntimeException("Error during encryption", e);
        }
    }

    public static String decrypt(String value) {
        try {
            SecretKeySpec secretKey = new SecretKeySpec(MASTER_KEY.substring(0, 16).getBytes(), ALGORITHM);
            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.DECRYPT_MODE, secretKey);
            byte[] decrypted = cipher.doFinal(Base64.getDecoder().decode(value));
            return new String(decrypted);
        } catch (Exception e) {
            // If decryption fails, return as is (might be legacy unencrypted data or already E2EE encrypted)
            return value;
        }
    }
}
