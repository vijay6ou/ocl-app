package com.ocl.maintenance;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Portrait WebView. Default and only technician server is the baked VPS URL.
 * Leftover builder/LAN URLs are ignored. Technicians see Retry, not a URL editor.
 */
public class MainActivity extends Activity {
    public static final String PREFS = "ocl_app";
    public static final String KEY_SERVER = "server_url";
    public static final String FILE_PROVIDER = "com.ocl.maintenance.fileprovider";
    public static final String LOCAL_UI = "file:///android_asset/index.html";

    private static final int REQ_FILE = 4101;
    private static final int REQ_CAMERA = 4102;
    private static final int REQ_NATIVE_CAPTURE = 4103;
    private static final int REQ_GALLERY = 4104;
    private static final int PROBE_MS = 2500;
    private static final int LOAD_WATCHDOG_MS = 4000;

    private WebView webView;
    private ProgressBar loadingBar;
    private View serverPanel;
    private View adminServerBlock;
    private EditText serverUrlField;
    private TextView serverMessage;
    private TextView serverTitle;
    private SharedPreferences prefs;
    private UpdateHelper updateHelper;
    private LocationHelper locationHelper;
    private LocalStore localStore;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private Runnable loadWatchdog;
    private boolean usingLocalUi;

    private ValueCallback<Uri[]> filePathCallback;
    private Uri cameraUri;
    private WebView printWebView;
    private String pendingFacing = "environment";
    private String lastCaptureDataUrl;

    @Override
    @SuppressLint("SetJavaScriptEnabled")
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        forgetLeftoverServer();
        localStore = new LocalStore(getFilesDir());
        webView = findViewById(R.id.webview);
        loadingBar = findViewById(R.id.loading_bar);
        serverPanel = findViewById(R.id.server_panel);
        adminServerBlock = findViewById(R.id.admin_server_block);
        serverUrlField = findViewById(R.id.server_url);
        serverMessage = findViewById(R.id.server_message);
        serverTitle = findViewById(R.id.server_title);
        Button save = findViewById(R.id.connect_button);
        Button offline = findViewById(R.id.offline_button);
        Button retry = findViewById(R.id.retry_button);

        save.setOnClickListener(v -> onSaveServer());
        offline.setOnClickListener(v -> loadLocalUi());
        retry.setOnClickListener(v -> launchWithoutHanging());
        serverTitle.setOnLongClickListener(v -> {
            boolean show = adminServerBlock.getVisibility() != View.VISIBLE;
            adminServerBlock.setVisibility(show ? View.VISIBLE : View.GONE);
            if (show) serverUrlField.setText("");
            return true;
        });

        configureWebView();
        updateHelper = new UpdateHelper(this);
        locationHelper = new LocationHelper(this);
        locationHelper.start();
        launchWithoutHanging();
    }

    /** Baked VPS URL unless an admin override is stored and is not leftover junk. */
    public String getServerUrl() {
        String stored = prefs.getString(KEY_SERVER, "");
        if (stored == null) stored = "";
        stored = stored.trim();
        if (stored.isEmpty() || isLeftoverHost(stored)) {
            return normalizeServerUrl(BuildConfig.DEFAULT_SERVER_URL);
        }
        return normalizeServerUrl(stored);
    }

    private void forgetLeftoverServer() {
        String stored = prefs.getString(KEY_SERVER, "");
        if (stored != null && isLeftoverHost(stored)) {
            prefs.edit().remove(KEY_SERVER).apply();
        }
    }

    static boolean isBuilderOnlyHost(String url) {
        return isLeftoverHost(url);
    }

    static boolean isLeftoverHost(String url) {
        if (url == null) return true;
        String u = url.toLowerCase().trim();
        if (u.isEmpty()) return true;
        return u.contains("172.30.0.2")
                || u.contains("0.0.0.0")
                || u.contains("10.0.2.2")
                || u.contains("127.0.0.1")
                || u.contains("localhost")
                || u.contains("192.168.")
                || u.contains(":43127");
    }

    static String normalizeServerUrl(String raw) {
        String url = raw == null ? "" : raw.trim();
        if (url.isEmpty()) return "";
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            url = "http://" + url;
        }
        while (url.endsWith("/")) url = url.substring(0, url.length() - 1);
        return url;
    }

    private void launchWithoutHanging() {
        cancelWatchdog();
        loadingBar.setVisibility(View.GONE);
        String server = getServerUrl();
        if (server.isEmpty()) {
            showUnreachableScreen(getString(R.string.cannot_reach));
            return;
        }
        probeThenLoad(server, false);
    }

    private void onSaveServer() {
        String typed = serverUrlField.getText().toString();
        String url = normalizeServerUrl(typed);
        if (url.isEmpty() || isLeftoverHost(url)) {
            serverMessage.setText(R.string.enter_or_offline);
            return;
        }
        loadingBar.setVisibility(View.VISIBLE);
        probeThenLoad(url, true);
    }

    private void probeThenLoad(String origin, boolean persistIfOk) {
        loadingBar.setVisibility(View.VISIBLE);
        new Thread(() -> {
            boolean ok = ping(origin, PROBE_MS);
            mainHandler.post(() -> {
                loadingBar.setVisibility(View.GONE);
                if (ok) {
                    if (persistIfOk) {
                        prefs.edit().putString(KEY_SERVER, origin).apply();
                    }
                    loadRemoteUi(origin);
                    updateHelper.checkNow();
                } else {
                    showUnreachableScreen(getString(R.string.still_unreachable));
                }
            });
        }).start();
    }

    static boolean ping(String origin, int timeoutMs) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(origin + "/login");
            conn = (HttpURLConnection) url.openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(timeoutMs);
            conn.setReadTimeout(timeoutMs);
            conn.setRequestMethod("GET");
            int code = conn.getResponseCode();
            return code > 0 && code < 500;
        } catch (Exception e) {
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    void showUnreachableScreen(String message) {
        cancelWatchdog();
        usingLocalUi = false;
        loadingBar.setVisibility(View.GONE);
        webView.setVisibility(View.GONE);
        webView.stopLoading();
        serverMessage.setText(message);
        if (adminServerBlock.getVisibility() == View.VISIBLE) {
            serverUrlField.setText("");
        }
        serverPanel.setVisibility(View.VISIBLE);
        serverPanel.bringToFront();
    }

    void loadLocalUi() {
        cancelWatchdog();
        usingLocalUi = true;
        loadingBar.setVisibility(View.GONE);
        serverPanel.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
        webView.loadUrl(LOCAL_UI);
    }

    private void loadRemoteUi(String origin) {
        usingLocalUi = false;
        serverPanel.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
        loadingBar.setVisibility(View.VISIBLE);
        cancelWatchdog();
        loadWatchdog = () -> {
            if (webView.getVisibility() == View.VISIBLE && loadingBar.getVisibility() == View.VISIBLE) {
                showUnreachableScreen(getString(R.string.still_unreachable));
            }
        };
        mainHandler.postDelayed(loadWatchdog, LOAD_WATCHDOG_MS);
        webView.loadUrl(origin + "/login");
    }

    private void cancelWatchdog() {
        if (loadWatchdog != null) {
            mainHandler.removeCallbacks(loadWatchdog);
            loadWatchdog = null;
        }
    }

    @SuppressLint({"SetJavaScriptEnabled", "Deprecated"})
    private void configureWebView() {
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cookies.setAcceptThirdPartyCookies(webView, true);
        }

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setGeolocationEnabled(true);
        settings.setGeolocationDatabasePath(getFilesDir().getPath());
        settings.setUserAgentString(
                settings.getUserAgentString() + " OCLMaintenance/" + BuildConfig.VERSION_NAME);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        webView.addJavascriptInterface(new NativeBridge(), "OCLNative");
        webView.setWebViewClient(new PlantClient());
        webView.setWebChromeClient(new PlantChrome());
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            if (url != null && url.contains("ocl-maintenance.apk")) {
                updateHelper.downloadAndInstall(url, "Technician app from plant server");
            }
        });
    }

    void printHtml(final String html, final String jobName) {
        runOnUiThread(() -> {
            printWebView = new WebView(this);
            printWebView.getSettings().setJavaScriptEnabled(false);
            printWebView.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    PrintHelper.print(MainActivity.this, view, jobName);
                }
            });
            String base = usingLocalUi ? LOCAL_UI : (getServerUrl().isEmpty() ? LOCAL_UI : getServerUrl() + "/");
            printWebView.loadDataWithBaseURL(base, html, "text/html", "UTF-8", null);
        });
    }

    private void openFileChooser(ValueCallback<Uri[]> callback, boolean capture) {
        if (filePathCallback != null) {
            filePathCallback.onReceiveValue(null);
        }
        filePathCallback = callback;
        // File inputs are gallery only. Rear/front camera is OCLNative.capturePhoto.
        startGalleryPick();
    }

    private void startGalleryPick() {
        Intent pick = new Intent(Intent.ACTION_PICK);
        pick.setDataAndType(android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI, "image/*");
        pick.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        Intent fallback = new Intent(Intent.ACTION_GET_CONTENT);
        fallback.addCategory(Intent.CATEGORY_OPENABLE);
        fallback.setType("image/*");
        fallback.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        Intent chooser = Intent.createChooser(pick, getString(R.string.pick_gallery));
        chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{fallback});
        startActivityForResult(chooser, REQ_GALLERY);
    }

    private void startNativeCapture(String facing) {
        pendingFacing = "user".equalsIgnoreCase(facing) ? "user" : "environment";
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.CAMERA}, REQ_CAMERA);
            return;
        }
        Intent capture = new Intent(this, CameraCaptureActivity.class);
        boolean front = "user".equals(pendingFacing);
        capture.putExtra(CameraCaptureActivity.EXTRA_FACING, pendingFacing);
        // Stock camera apps ignore these extras; CameraCaptureActivity does not.
        // Keep them on the intent so any chooser fallback still asks for the right lens.
        capture.putExtra("android.intent.extras.CAMERA_FACING", front ? 1 : 0);
        capture.putExtra("android.intent.extras.LENS_FACING_FRONT", front ? 1 : 0);
        capture.putExtra("android.intent.extra.USE_FRONT_CAMERA", front);
        capture.putExtra("android.intent.extras.LENS_FACING_BACK", front ? 0 : 1);
        capture.putExtra("camerafacing", front ? "front" : "back");
        capture.putExtra("facing", pendingFacing);
        startActivityForResult(capture, REQ_NATIVE_CAPTURE);
    }

    private void launchChooser() {
        startGalleryPick();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_CAMERA) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                startNativeCapture(pendingFacing);
            } else {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                    filePathCallback = null;
                }
                notifyCaptureReady();
            }
        }
        if (requestCode == LocationHelper.REQ_LOCATION && locationHelper != null) {
            locationHelper.onPermissionResult();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_NATIVE_CAPTURE || requestCode == REQ_GALLERY) {
            lastCaptureDataUrl = null;
            cameraUri = null;
            if (resultCode == RESULT_OK) {
                if (requestCode == REQ_GALLERY && data != null && data.getData() != null) {
                    cameraUri = data.getData();
                    lastCaptureDataUrl = uriToJpegDataUrl(cameraUri);
                } else if (data != null) {
                    String path = data.getStringExtra(CameraCaptureActivity.EXTRA_PATH);
                    if (path != null) {
                        File file = new File(path);
                        if (file.exists()) {
                            lastCaptureDataUrl = "data:image/jpeg;base64," + readFileBase64(file);
                            cameraUri = FileProvider.getUriForFile(this, FILE_PROVIDER, file);
                        }
                    }
                }
            }
            if (filePathCallback != null) {
                Uri[] result = (resultCode == RESULT_OK && cameraUri != null)
                        ? new Uri[]{cameraUri}
                        : null;
                filePathCallback.onReceiveValue(result);
                filePathCallback = null;
            }
            notifyCaptureReady();
            return;
        }
        if (requestCode != REQ_FILE || filePathCallback == null) {
            return;
        }
        Uri[] result = null;
        if (resultCode == RESULT_OK) {
            if (data != null && data.getData() != null) {
                result = new Uri[]{data.getData()};
            } else if (cameraUri != null) {
                result = new Uri[]{cameraUri};
            }
        }
        filePathCallback.onReceiveValue(result);
        filePathCallback = null;
    }

    private void notifyCaptureReady() {
        webView.post(() -> webView.evaluateJavascript(
                "window.__oclOnCaptureReady && window.__oclOnCaptureReady()",
                null
        ));
    }

    private static String readFileBase64(File file) {
        try {
            java.io.FileInputStream in = new java.io.FileInputStream(file);
            byte[] buf = new byte[(int) file.length()];
            int off = 0;
            while (off < buf.length) {
                int n = in.read(buf, off, buf.length - off);
                if (n < 0) break;
                off += n;
            }
            in.close();
            return android.util.Base64.encodeToString(buf, android.util.Base64.NO_WRAP);
        } catch (Exception e) {
            return "";
        }
    }

    private String uriToJpegDataUrl(Uri uri) {
        File tmp = new File(new File(getCacheDir(), "camera"), "gallery-pick.jpg");
        File parent = tmp.getParentFile();
        if (parent != null && !parent.exists()) parent.mkdirs();
        try (InputStream in = getContentResolver().openInputStream(uri);
             FileOutputStream fos = new FileOutputStream(tmp)) {
            if (in == null) return null;
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) >= 0) fos.write(buf, 0, n);
        } catch (Exception e) {
            return null;
        }
        Bitmap bmp = BitmapFactory.decodeFile(tmp.getAbsolutePath());
        if (bmp == null) return null;
        int rotation = 0;
        try {
            ExifInterface exif = new ExifInterface(tmp.getAbsolutePath());
            int o = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            if (o == ExifInterface.ORIENTATION_ROTATE_90) rotation = 90;
            else if (o == ExifInterface.ORIENTATION_ROTATE_180) rotation = 180;
            else if (o == ExifInterface.ORIENTATION_ROTATE_270) rotation = 270;
        } catch (Exception ignored) {
        }
        if (rotation != 0) {
            Matrix matrix = new Matrix();
            matrix.postRotate(rotation);
            Bitmap rotated = Bitmap.createBitmap(bmp, 0, 0, bmp.getWidth(), bmp.getHeight(), matrix, true);
            if (rotated != bmp) bmp.recycle();
            bmp = rotated;
        }
        int w = bmp.getWidth();
        int h = bmp.getHeight();
        int max = Math.max(w, h);
        if (max > 1600) {
            float scale = 1600f / max;
            Bitmap scaled = Bitmap.createScaledBitmap(bmp, Math.round(w * scale), Math.round(h * scale), true);
            if (scaled != bmp) bmp.recycle();
            bmp = scaled;
        }
        ByteArrayOutputStream jpeg = new ByteArrayOutputStream();
        bmp.compress(Bitmap.CompressFormat.JPEG, 86, jpeg);
        bmp.recycle();
        return "data:image/jpeg;base64," + android.util.Base64.encodeToString(jpeg.toByteArray(), android.util.Base64.NO_WRAP);
    }

    @Override
    public void onBackPressed() {
        if (serverPanel.getVisibility() == View.VISIBLE && webView.getVisibility() == View.VISIBLE) {
            serverPanel.setVisibility(View.GONE);
            return;
        }
        if (webView.getVisibility() == View.VISIBLE && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        cancelWatchdog();
        if (locationHelper != null) locationHelper.stop();
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.destroy();
        }
        super.onDestroy();
    }

    private class PlantClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request) {
            Uri uri = request.getUrl();
            String scheme = uri.getScheme();
            if ("http".equals(scheme) || "https".equals(scheme) || "file".equals(scheme)) {
                return false;
            }
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (Exception ignored) {
            }
            return true;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            cancelWatchdog();
            loadingBar.setVisibility(View.GONE);
            CookieManager.getInstance().flush();
        }

        @Override
        public void onReceivedError(WebView view, android.webkit.WebResourceRequest request, android.webkit.WebResourceError error) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && request != null && !request.isForMainFrame()) {
                return;
            }
            if (usingLocalUi) return;
            showUnreachableScreen(getString(R.string.still_unreachable));
        }

        @Override
        public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
            if (usingLocalUi) return;
            showUnreachableScreen(getString(R.string.still_unreachable));
        }
    }

    private class PlantChrome extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(
                WebView webView,
                ValueCallback<Uri[]> filePathCallback,
                FileChooserParams fileChooserParams) {
            // Never route a file input to the camera. capture= on <input> is ignored here.
            openFileChooser(filePathCallback, false);
            return true;
        }

        @Override
        public void onGeolocationPermissionsShowPrompt(
                String origin, GeolocationPermissions.Callback callback) {
            if (locationHelper != null) locationHelper.ensurePermission();
            boolean allow = locationHelper != null && locationHelper.hasPermission();
            callback.invoke(origin, allow, false);
        }

        @Override
        public void onPermissionRequest(final android.webkit.PermissionRequest request) {
            runOnUiThread(() -> request.grant(request.getResources()));
        }

        @Override
        public boolean onJsAlert(WebView view, String url, String message, final android.webkit.JsResult result) {
            new AlertDialog.Builder(MainActivity.this)
                    .setMessage(message)
                    .setPositiveButton(android.R.string.ok, (d, w) -> result.confirm())
                    .setOnCancelListener(d -> result.cancel())
                    .show();
            return true;
        }

        @Override
        public boolean onJsConfirm(WebView view, String url, String message, final android.webkit.JsResult result) {
            new AlertDialog.Builder(MainActivity.this)
                    .setMessage(message)
                    .setPositiveButton(android.R.string.ok, (d, w) -> result.confirm())
                    .setNegativeButton(android.R.string.cancel, (d, w) -> result.cancel())
                    .setOnCancelListener(d -> result.cancel())
                    .show();
            return true;
        }
    }

    public class NativeBridge {
        @JavascriptInterface
        public boolean available() {
            return true;
        }

        @JavascriptInterface
        public void printHtml(String html, String jobName) {
            String name = (jobName == null || jobName.trim().isEmpty())
                    ? "Adani Cements Maintenance Report"
                    : jobName;
            MainActivity.this.printHtml(html, name);
        }

        @JavascriptInterface
        public String appVersionName() {
            return BuildConfig.VERSION_NAME;
        }

        @JavascriptInterface
        public int appVersionCode() {
            return BuildConfig.VERSION_CODE;
        }

        @JavascriptInterface
        public String platform() {
            return "Android " + Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ")";
        }

        @JavascriptInterface
        public String getItem(String key) {
            return prefs.getString(key, null);
        }

        @JavascriptInterface
        public void setItem(String key, String value) {
            prefs.edit().putString(key, value).apply();
        }

        @JavascriptInterface
        public void removeItem(String key) {
            prefs.edit().remove(key).apply();
        }

        @JavascriptInterface
        public String serverUrl() {
            return getServerUrl();
        }

        @JavascriptInterface
        public void openServerSettings() {
            runOnUiThread(() -> showUnreachableScreen(getString(R.string.cannot_reach)));
        }

        @JavascriptInterface
        public boolean writeText(String name, String text) {
            return localStore.writeText(name, text);
        }

        @JavascriptInterface
        public String readText(String name) {
            return localStore.readText(name);
        }

        @JavascriptInterface
        public boolean writeBase64(String name, String b64) {
            return localStore.writeBase64(name, b64);
        }

        @JavascriptInterface
        public String readBase64(String name) {
            return localStore.readBase64(name);
        }

        @JavascriptInterface
        public boolean deleteFile(String name) {
            return localStore.delete(name);
        }

        @JavascriptInterface
        public void capturePhoto(String facing) {
            final String lens = "user".equalsIgnoreCase(facing) ? "user" : "environment";
            runOnUiThread(() -> {
                lastCaptureDataUrl = null;
                startNativeCapture(lens);
            });
        }

        @JavascriptInterface
        public void pickGallery() {
            runOnUiThread(() -> {
                lastCaptureDataUrl = null;
                startGalleryPick();
            });
        }

        @JavascriptInterface
        public String takeLastCapture() {
            return lastCaptureDataUrl;
        }

        @JavascriptInterface
        public void requestLocationPermission() {
            runOnUiThread(() -> {
                if (locationHelper != null) locationHelper.ensurePermission();
            });
        }

        @JavascriptInterface
        public boolean hasLocationPermission() {
            return locationHelper != null && locationHelper.hasPermission();
        }

        @JavascriptInterface
        public String getLocation() {
            if (locationHelper == null || !locationHelper.hasPermission()) return "";
            return locationHelper.lastLocationJson();
        }

        @JavascriptInterface
        public void pingLocationNow() {
            runOnUiThread(() -> {
                if (locationHelper != null) locationHelper.pingNow();
            });
        }

        @JavascriptInterface
        public void checkUpdate() {
            runOnUiThread(() -> updateHelper.checkNow(true));
        }

        @JavascriptInterface
        public void installUpdate(String url) {
            if (url == null || url.trim().isEmpty()) return;
            runOnUiThread(() -> updateHelper.downloadAndInstall(url, "Update from plant server"));
        }
    }
}
