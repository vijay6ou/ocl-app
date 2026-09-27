package com.ocl.maintenance;

import android.content.Context;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/** Resolves the baked plant origin at runtime. Ciphertext is not a UTF-8 string in the APK. */
final class PlantHost {
    private static final int[] MIX = {167, 62, 81, 200, 25, 242, 109, 68};

    private PlantHost() {}

    static String origin(Context context) {
        byte[] packed = readRaw(context);
        if (packed.length == 0) return "";
        byte[] out = new byte[packed.length];
        int salt = android.os.Build.VERSION.SDK_INT > 0 ? 0 : 1;
        for (int i = 0; i < packed.length; i++) {
            out[i] = (byte) (packed[i] ^ MIX[i % MIX.length] ^ ((i * 13) & 0xFF) ^ salt);
        }
        return new String(out, StandardCharsets.US_ASCII);
    }

    private static byte[] readRaw(Context context) {
        try (InputStream in = context.getResources().openRawResource(R.raw.cfg);
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[64];
            int n;
            while ((n = in.read(buf)) >= 0) out.write(buf, 0, n);
            return out.toByteArray();
        } catch (Exception ignored) {
            return new byte[0];
        }
    }
}
