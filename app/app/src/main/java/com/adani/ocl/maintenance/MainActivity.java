package com.adani.ocl.maintenance;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.ProgressBar;
import android.widget.Toast;

public class MainActivity extends Activity {

    private WebView webView;
    private ProgressBar loadingBar;
    private String pendingPrintHtml = null;
    private final Handler ui = new Handler(Looper.getMainLooper());

    /** Bumped by hand each release; the web layer reads these to detect updates. */
    private static final String BUILD_VERSION_NAME = "2.1.0";
    private static final int BUILD_VERSION_CODE = 3;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Fullscreen / immersive flags
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        );

        setContentView(R.layout.activity_main);

        loadingBar = findViewById(R.id.loading_bar);
        webView    = findViewById(R.id.webview);

        // ── WebSettings ──────────────────────────────────────────────────────────
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);          // JS must be on
        settings.setDomStorageEnabled(true);           // localStorage / sessionStorage
        settings.setAllowFileAccess(true);             // needed to load android_asset
        settings.setAllowContentAccess(false);         // no content:// access required

        // The page is served from file:///android_asset/. Submitting to Google
        // Apps Script is a cross-origin request from that file:// origin, which
        // WebView blocks unless universal access is granted. This flag is therefore
        // a deliberate, required trade-off for the Sheets feature, not an oversight.
        // It is defensible here because the app loads only bundled assets and never
        // navigates to a remote or user-supplied page.
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);

        // All remote endpoints are HTTPS (fonts.googleapis.com, script.google.com),
        // so cleartext is refused rather than allowed.
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setDisplayZoomControls(false);
        settings.setBuiltInZoomControls(false);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                if (loadingBar != null) loadingBar.setVisibility(View.VISIBLE);
            }
            @Override
            public void onPageFinished(WebView view, String url) {
                if (loadingBar != null) loadingBar.setVisibility(View.GONE);
            }
        });

        // ── Native bridge ────────────────────────────────────────────────────────
        // Exposed only to our own bundled asset page; the WebView never navigates
        // anywhere else, so no third-party page can reach these methods.
        webView.addJavascriptInterface(new NativeBridge(this), "OCLNative");

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onJsAlert(WebView view, String url,
                                     String message, final JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                        .setTitle("OCL Maintenance")
                        .setMessage(message)
                        .setPositiveButton("OK", (d, w) -> result.confirm())
                        .setCancelable(false)
                        .show();
                return true;
            }

            @Override
            public boolean onJsConfirm(WebView view, String url,
                                       String message, final JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                        .setTitle("OCL Maintenance")
                        .setMessage(message)
                        .setPositiveButton("OK", (d, w) -> result.confirm())
                        .setNegativeButton("Cancel", (d, w) -> result.cancel())
                        .setCancelable(false)
                        .show();
                return true;
            }

            @Override
            public boolean onJsPrompt(WebView view, String url, String message,
                                      String defaultValue, final JsPromptResult result) {
                final EditText et = new EditText(MainActivity.this);
                et.setText(defaultValue);
                new AlertDialog.Builder(MainActivity.this)
                        .setTitle(message)
                        .setView(et)
                        .setPositiveButton("OK", (d, w) -> result.confirm(et.getText().toString()))
                        .setNegativeButton("Cancel", (d, w) -> result.cancel())
                        .setCancelable(false)
                        .show();
                return true;
            }

            @Override
            public boolean onConsoleMessage(ConsoleMessage cm) {
                android.util.Log.d("OCLWebView",
                    cm.message() + " -- From line " + cm.lineNumber() + " of " + cm.sourceId());
                return true;
            }
        });

        webView.loadUrl("file:///android_asset/index.html");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  NATIVE BRIDGE
    //  WebView cannot print (window.print() is a no-op) and its localStorage can be
    //  evicted. Both are solved natively here and exposed to the web layer.
    // ═══════════════════════════════════════════════════════════════════════════
    private class NativeBridge {

        private final SharedPreferences prefs;

        NativeBridge(Context ctx) {
            prefs = ctx.getSharedPreferences("ocl_app", Context.MODE_PRIVATE);
        }

        /** Durable key/value store that survives WebView cache eviction. */
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
        public boolean available() {
            return true;
        }

        @JavascriptInterface
        public String appVersionName() {
            return BUILD_VERSION_NAME;
        }

        @JavascriptInterface
        public int appVersionCode() {
            return BUILD_VERSION_CODE;
        }

        @JavascriptInterface
        public String platform() {
            return "Android " + Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ")";
        }

        /**
         * Render a standalone HTML document through Android's print framework. This
         * is what makes "Save as PDF" and sharing to WhatsApp / Drive / e-mail work;
         * the WebView's own window.print() does nothing on Android.
         */
        @JavascriptInterface
        public void printHtml(final String html, final String jobName) {
            if (html == null || html.trim().isEmpty()) return;
            pendingPrintHtml = html;
            ui.post(() -> runPrintJob(jobName));
        }

        /** Open a URL in the system browser / downloader (used for app updates). */
        @JavascriptInterface
        public void openUrl(final String url) {
            if (url == null || url.trim().isEmpty()) return;
            ui.post(() -> {
                try {
                    Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(i);
                } catch (ActivityNotFoundException e) {
                    toast("No app available to open that link.");
                }
            });
        }
    }

    private void runPrintJob(String jobName) {
        if (pendingPrintHtml == null) return;
        final String html = pendingPrintHtml;
        pendingPrintHtml = null;

        try {
            // Load the report into the WebView so printDocument() captures it, then
            // restore the app afterwards.
            webView.loadDataWithBaseURL(
                "file:///android_asset/", html, "text/html", "UTF-8", null);

            PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
            if (pm == null) { restoreApp(); toast("Printing is not available on this device."); return; }

            final String name = (jobName == null || jobName.trim().isEmpty())
                    ? "OCL Maintenance Report" : jobName;

            PrintDocumentAdapter adapter = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP)
                    ? webView.createPrintDocumentAdapter(name)
                    : webView.createPrintDocumentAdapter();

            PrintAttributes attrs = new PrintAttributes.Builder()
                    .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                    .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                    .build();

            pm.print(name, adapter, attrs);

            // Bring the app back so the user is not left staring at a bare report page.
            ui.postDelayed(this::restoreApp, 60000);
        } catch (Throwable t) {
            android.util.Log.e("OCLPrint", "print failed", t);
            restoreApp();
            toast("Could not open the print dialog.");
        }
    }

    private void restoreApp() {
        if (webView != null) webView.loadUrl("file:///android_asset/index.html");
    }

    private void toast(String msg) {
        Toast.makeText(MainActivity.this, msg, Toast.LENGTH_LONG).show();
    }

    // ── Back-button navigates in WebView history ──────────────────────────────
    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) webView.onPause();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.clearHistory();
            webView.clearCache(true);
            webView.loadUrl("about:blank");
            webView.destroy();
        }
        super.onDestroy();
    }
}
