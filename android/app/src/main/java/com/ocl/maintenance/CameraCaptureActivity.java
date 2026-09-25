package com.ocl.maintenance;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.ImageFormat;
import android.graphics.Matrix;
import android.graphics.SurfaceTexture;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CaptureRequest;
import android.hardware.camera2.TotalCaptureResult;
import android.media.ExifInterface;
import android.media.Image;
import android.media.ImageReader;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Size;
import android.view.Surface;
import android.view.TextureView;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.content.ContextCompat;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.ByteBuffer;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

/**
 * In-app Camera2 still capture. Opens the back lens unless facing=user (selfie).
 * Stock camera intents ignore CAMERA_FACING extras; this does not.
 */
public class CameraCaptureActivity extends Activity implements TextureView.SurfaceTextureListener {
    public static final String EXTRA_FACING = "facing";
    public static final String EXTRA_PATH = "path";

    private TextureView preview;
    private boolean front;
    private String cameraId;
    private CameraDevice camera;
    private CameraCaptureSession session;
    private CaptureRequest.Builder previewBuilder;
    private ImageReader imageReader;
    private HandlerThread cameraThread;
    private Handler cameraHandler;
    private File outFile;
    private boolean capturing;
    private int sensorOrientation = 90;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_camera);
        front = "user".equalsIgnoreCase(getIntent().getStringExtra(EXTRA_FACING));
        TextView label = findViewById(R.id.camera_facing_label);
        label.setText(front ? R.string.camera_front : R.string.camera_rear);
        preview = findViewById(R.id.camera_preview);
        Button shutter = findViewById(R.id.camera_shutter);
        Button cancel = findViewById(R.id.camera_cancel);
        shutter.setOnClickListener(v -> takeStill());
        cancel.setOnClickListener(v -> {
            setResult(RESULT_CANCELED);
            finish();
        });
        outFile = new File(new File(getCacheDir(), "camera"), front ? "selfie.jpg" : "equipment.jpg");
        File parent = outFile.getParentFile();
        if (parent != null && !parent.exists()) parent.mkdirs();
        preview.setSurfaceTextureListener(this);
    }

    @Override
    protected void onResume() {
        super.onResume();
        cameraThread = new HandlerThread("adani-camera");
        cameraThread.start();
        cameraHandler = new Handler(cameraThread.getLooper());
        if (preview.isAvailable()) {
            openCamera();
        }
    }

    @Override
    protected void onPause() {
        closeCamera();
        if (cameraThread != null) {
            cameraThread.quitSafely();
            cameraThread = null;
        }
        super.onPause();
    }

    @Override
    public void onSurfaceTextureAvailable(SurfaceTexture surface, int width, int height) {
        if (front) preview.setScaleX(-1f);
        openCamera();
    }

    @Override
    public void onSurfaceTextureSizeChanged(SurfaceTexture surface, int width, int height) {}

    @Override
    public boolean onSurfaceTextureDestroyed(SurfaceTexture surface) {
        return true;
    }

    @Override
    public void onSurfaceTextureUpdated(SurfaceTexture surface) {}

    private void openCamera() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) {
            Toast.makeText(this, R.string.camera_permission, Toast.LENGTH_LONG).show();
            setResult(RESULT_CANCELED);
            finish();
            return;
        }
        CameraManager manager = (CameraManager) getSystemService(Context.CAMERA_SERVICE);
        try {
            cameraId = pickCameraId(manager, front);
            if (cameraId == null) {
                Toast.makeText(this, R.string.camera_missing, Toast.LENGTH_LONG).show();
                finish();
                return;
            }
            CameraCharacteristics chars = manager.getCameraCharacteristics(cameraId);
            Integer sensor = chars.get(CameraCharacteristics.SENSOR_ORIENTATION);
            sensorOrientation = sensor == null ? (front ? 270 : 90) : sensor;
            Size jpeg = chooseJpegSize(chars.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
                    .getOutputSizes(ImageFormat.JPEG));
            imageReader = ImageReader.newInstance(jpeg.getWidth(), jpeg.getHeight(), ImageFormat.JPEG, 2);
            imageReader.setOnImageAvailableListener(reader -> {
                Image image = reader.acquireLatestImage();
                if (image == null) return;
                ByteBuffer buf = image.getPlanes()[0].getBuffer();
                byte[] bytes = new byte[buf.remaining()];
                buf.get(bytes);
                image.close();
                try (FileOutputStream out = new FileOutputStream(outFile)) {
                    out.write(bytes);
                } catch (Exception e) {
                    runOnUiThread(() -> {
                        Toast.makeText(this, R.string.camera_failed, Toast.LENGTH_LONG).show();
                        setResult(RESULT_CANCELED);
                        finish();
                    });
                    return;
                }
                bakeUprightJpegFile(outFile, front, sensorOrientation);
                Intent data = new Intent();
                data.putExtra(EXTRA_PATH, outFile.getAbsolutePath());
                data.putExtra(EXTRA_FACING, front ? "user" : "environment");
                runOnUiThread(() -> {
                    setResult(RESULT_OK, data);
                    finish();
                });
            }, cameraHandler);
            manager.openCamera(cameraId, stateCallback, cameraHandler);
        } catch (Exception e) {
            Toast.makeText(this, R.string.camera_failed, Toast.LENGTH_LONG).show();
            setResult(RESULT_CANCELED);
            finish();
        }
    }

    private final CameraDevice.StateCallback stateCallback = new CameraDevice.StateCallback() {
        @Override
        public void onOpened(CameraDevice cameraDevice) {
            camera = cameraDevice;
            startPreview();
        }

        @Override
        public void onDisconnected(CameraDevice cameraDevice) {
            cameraDevice.close();
            camera = null;
        }

        @Override
        public void onError(CameraDevice cameraDevice, int error) {
            cameraDevice.close();
            camera = null;
            runOnUiThread(() -> {
                Toast.makeText(CameraCaptureActivity.this, R.string.camera_failed, Toast.LENGTH_LONG).show();
                setResult(RESULT_CANCELED);
                finish();
            });
        }
    };

    private void startPreview() {
        try {
            SurfaceTexture texture = preview.getSurfaceTexture();
            if (texture == null || camera == null) return;
            texture.setDefaultBufferSize(1280, 960);
            Surface previewSurface = new Surface(texture);
            previewBuilder = camera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);
            previewBuilder.addTarget(previewSurface);
            camera.createCaptureSession(
                    Arrays.asList(previewSurface, imageReader.getSurface()),
                    new CameraCaptureSession.StateCallback() {
                        @Override
                        public void onConfigured(CameraCaptureSession captureSession) {
                            session = captureSession;
                            try {
                                previewBuilder.set(CaptureRequest.CONTROL_AF_MODE,
                                        CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);
                                session.setRepeatingRequest(previewBuilder.build(), null, cameraHandler);
                            } catch (CameraAccessException ignored) {
                            }
                        }

                        @Override
                        public void onConfigureFailed(CameraCaptureSession captureSession) {
                            runOnUiThread(() -> {
                                Toast.makeText(CameraCaptureActivity.this, R.string.camera_failed, Toast.LENGTH_LONG).show();
                                finish();
                            });
                        }
                    },
                    cameraHandler
            );
        } catch (Exception e) {
            Toast.makeText(this, R.string.camera_failed, Toast.LENGTH_LONG).show();
        }
    }

    private void takeStill() {
        if (capturing || camera == null || session == null) return;
        capturing = true;
        try {
            CaptureRequest.Builder still = camera.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE);
            still.addTarget(imageReader.getSurface());
            still.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);
            still.set(CaptureRequest.JPEG_ORIENTATION, sensorOrientation);
            session.capture(still.build(), new CameraCaptureSession.CaptureCallback() {
                @Override
                public void onCaptureCompleted(CameraCaptureSession session, CaptureRequest request, TotalCaptureResult result) {
                    /* ImageReader listener writes the file */
                }
            }, cameraHandler);
        } catch (Exception e) {
            capturing = false;
            Toast.makeText(this, R.string.camera_failed, Toast.LENGTH_LONG).show();
        }
    }

    /**
     * Rotate JPEG pixels so the person is upright, then rewrite without an EXIF orientation tag.
     * Camera2 often stores a landscape buffer with EXIF 6/8, or no EXIF at all.
     */
    static void bakeUprightJpegFile(File file, boolean front, int sensorOrientationDeg) {
        Bitmap bmp = BitmapFactory.decodeFile(file.getAbsolutePath());
        if (bmp == null) return;
        int rotation = 0;
        try {
            ExifInterface exif = new ExifInterface(file.getAbsolutePath());
            int o = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            if (o == ExifInterface.ORIENTATION_ROTATE_90) rotation = 90;
            else if (o == ExifInterface.ORIENTATION_ROTATE_180) rotation = 180;
            else if (o == ExifInterface.ORIENTATION_ROTATE_270) rotation = 270;
        } catch (Exception ignored) {
        }
        boolean landscape = bmp.getWidth() > bmp.getHeight();
        if (rotation == 0 && landscape) {
            int sensor = sensorOrientationDeg % 360;
            if (sensor < 0) sensor += 360;
            rotation = sensor == 0 ? (front ? 270 : 90) : sensor;
        }
        if (rotation != 0 && !landscape && (rotation == 90 || rotation == 270)) {
            // Already portrait; EXIF still asks for 90/270 — pixels are upright, drop the tag.
            rotation = 0;
        }
        try {
            Bitmap out = bmp;
            if (rotation != 0) {
                Matrix matrix = new Matrix();
                matrix.postRotate(rotation);
                out = Bitmap.createBitmap(bmp, 0, 0, bmp.getWidth(), bmp.getHeight(), matrix, true);
            }
            FileOutputStream fos = new FileOutputStream(file);
            out.compress(Bitmap.CompressFormat.JPEG, 86, fos);
            fos.close();
            if (out != bmp) out.recycle();
            bmp.recycle();
        } catch (Exception ignored) {
            bmp.recycle();
        }
    }

    private void closeCamera() {
        if (session != null) {
            session.close();
            session = null;
        }
        if (camera != null) {
            camera.close();
            camera = null;
        }
        if (imageReader != null) {
            imageReader.close();
            imageReader = null;
        }
    }

    static String pickCameraId(CameraManager manager, boolean front) throws CameraAccessException {
        String fallback = null;
        for (String id : manager.getCameraIdList()) {
            CameraCharacteristics chars = manager.getCameraCharacteristics(id);
            Integer facing = chars.get(CameraCharacteristics.LENS_FACING);
            if (facing == null) continue;
            if (front && facing == CameraCharacteristics.LENS_FACING_FRONT) return id;
            if (!front && facing == CameraCharacteristics.LENS_FACING_BACK) return id;
            if (fallback == null) fallback = id;
        }
        return fallback;
    }

    static Size chooseJpegSize(Size[] choices) {
        if (choices == null || choices.length == 0) return new Size(1280, 960);
        List<Size> list = Arrays.asList(choices);
        Collections.sort(list, Comparator.comparingInt(s -> s.getWidth() * s.getHeight()));
        for (int i = list.size() - 1; i >= 0; i--) {
            Size s = list.get(i);
            if (s.getWidth() <= 1920 && s.getHeight() <= 1440) return s;
        }
        return list.get(list.size() / 2);
    }
}
