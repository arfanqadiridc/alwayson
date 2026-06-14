package com.alwayson.api.util;

import javax.crypto.Cipher;
import javax.crypto.spec.SecretKeySpec;
import java.util.Base64;

public class CryptoUtils {

    // A 16-Byte Key required for native 128-bit AES Encryption
    // In strict production, this would be injected via standard OS Environment Variables so no key exists in code!
    private static final byte[] FIXED_KEY = "AlwaysOnSuperKey".getBytes();
    private static final String ALGORITHM = "AES/ECB/PKCS5Padding";

    public static String encrypt(String plainText) {
        try {
            SecretKeySpec keySpec = new SecretKeySpec(FIXED_KEY, "AES");
            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.ENCRYPT_MODE, keySpec);
            byte[] encryptedData = cipher.doFinal(plainText.getBytes());
            return "ENC(" + Base64.getEncoder().encodeToString(encryptedData) + ")";
        } catch (Exception e) {
            throw new RuntimeException("Encryption fault", e);
        }
    }

    public static String decrypt(String encryptedText) {
        try {
            if (encryptedText == null || !encryptedText.startsWith("ENC(") || !encryptedText.endsWith(")")) {
                return encryptedText; // Pass-through if unencrypted.
            }

            // Strip out ENC() wrapper
            String base64Value = encryptedText.substring(4, encryptedText.length() - 1);
            
            SecretKeySpec keySpec = new SecretKeySpec(FIXED_KEY, "AES");
            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.DECRYPT_MODE, keySpec);
            byte[] decodedData = Base64.getDecoder().decode(base64Value);
            return new String(cipher.doFinal(decodedData));
        } catch (Exception e) {
            throw new RuntimeException("Decryption fault", e);
        }
    }

    public static void main(String[] args) {
        if (args.length > 0) {
            System.out.println(encrypt(args[0]));
        } else {
            System.out.println("Please provide text to encrypt.");
        }
    }
}
