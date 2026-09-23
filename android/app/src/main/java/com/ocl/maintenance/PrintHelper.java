package com.ocl.maintenance;

import android.app.Activity;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;

/** PrintManager path used by the original OCL APK (window.print is a no-op in WebView). */
final class PrintHelper {
    private PrintHelper() {}

    static void print(Activity activity, WebView webView, String jobName) {
        PrintManager manager = (PrintManager) activity.getSystemService(Activity.PRINT_SERVICE);
        if (manager == null) return;
        PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter(jobName);
        PrintAttributes attrs = new PrintAttributes.Builder()
                .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                .build();
        manager.print(jobName, adapter, attrs);
    }
}
