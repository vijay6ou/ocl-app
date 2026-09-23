package com.ocl.maintenance;

import android.util.Base64;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

/** On-device files for records and defect photos (SharedPreferences is too small for images). */
final class LocalStore {
    private final File root;

    LocalStore(File filesDir) {
        this.root = new File(filesDir, "ocl");
    }

    File file(String name) {
        if (name == null || name.isEmpty() || name.contains("..")) return null;
        for (int i = 0; i < name.length(); i++) {
            char c = name.charAt(i);
            boolean ok = (c >= 'a' && c <= 'z')
                    || (c >= 'A' && c <= 'Z')
                    || (c >= '0' && c <= '9')
                    || c == '.' || c == '_' || c == '-' || c == '/';
            if (!ok) return null;
        }
        if (!root.exists() && !root.mkdirs()) return null;
        File f = new File(root, name);
        try {
            String base = root.getCanonicalPath();
            String path = f.getCanonicalPath();
            if (!path.equals(base) && !path.startsWith(base + File.separator)) return null;
            File parent = f.getParentFile();
            if (parent != null && !parent.exists() && !parent.mkdirs()) return null;
            return f;
        } catch (Exception e) {
            return null;
        }
    }

    String readText(String name) {
        File f = file(name);
        if (f == null || !f.isFile()) return null;
        try (FileInputStream in = new FileInputStream(f)) {
            return new String(readAll(in), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return null;
        }
    }

    boolean writeText(String name, String text) {
        File f = file(name);
        if (f == null) return false;
        try (FileOutputStream out = new FileOutputStream(f)) {
            out.write((text == null ? "" : text).getBytes(StandardCharsets.UTF_8));
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    String readBase64(String name) {
        File f = file(name);
        if (f == null || !f.isFile()) return null;
        try (FileInputStream in = new FileInputStream(f)) {
            return Base64.encodeToString(readAll(in), Base64.NO_WRAP);
        } catch (Exception e) {
            return null;
        }
    }

    boolean writeBase64(String name, String b64) {
        File f = file(name);
        if (f == null || b64 == null) return false;
        try {
            byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
            try (FileOutputStream out = new FileOutputStream(f)) {
                out.write(bytes);
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    boolean delete(String name) {
        File f = file(name);
        return f != null && f.isFile() && f.delete();
    }

    private static byte[] readAll(FileInputStream in) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) >= 0) out.write(buf, 0, n);
        return out.toByteArray();
    }
}
